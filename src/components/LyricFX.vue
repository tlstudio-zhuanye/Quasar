<script setup>
/**
 * LyricFX.vue — 全局星河粒子层（v1.2.7，移植自 mineradio 的 star-river）
 *
 * 原生 WebGL 移植 mineradio 的「歌词星河」着色器：420+ 粒子按 5 条「河道」流动、
 * 正弦曲线摆动、加性混合发光、随低音/节拍脉动。不依赖 THREE.js。
 *
 * 用法：铺在任意全屏容器里（position:absolute/fixed; inset:0），pointer-events:none 不挡操作。
 * 音频分析（AnalyserNode）只接不切断播放链路，失败即退化为纯氛围流动。
 */
import { ref, onMounted, onUnmounted, watch } from 'vue'
import { getAudio } from '../stores/player'

const props = defineProps({
  accent: { type: String, default: '#5b8cff' },
  active: { type: Boolean, default: false }
})

const canvas = ref(null)
let gl = null
let program = null
let raf = 0
let startT = 0
let dpr = 1
let W = 0, H = 0
const COUNT = 1400
let uniform = {}
let analyser = null
let freqData = null
let audioCtx = null
let ro = null
let energy = 0          // 0~1 平滑能量
let prevEnergy = 0
let beat = 0

/* ---------- 着色器（移植 mineradio 03-lyrics-star-river.js） ---------- */
const VERT = [
  'precision highp float;',
  'attribute float aSeed, aLane, aDepth;',
  'uniform float uTime, uBass, uBeat, uWidth, uHeight, uPixel;',
  'varying float vSeed, vLane, vGlow;',
  'float hash(float n){return fract(sin(n)*43758.5453123);}',
  'void main(){',
  '  float laneBand = floor(aLane * 5.0);',
  '  float laneLocal = fract(aLane * 5.0);',
  '  float speed = 0.030 + hash(aSeed * 1.71) * 0.055 + laneBand * 0.005;',
  '  float flow = fract(hash(aSeed * 2.13) + uTime * speed);',
  '  float x = (flow - 0.5) * uWidth * (1.08 + hash(aSeed * 5.1) * 0.18);',
  '  float curve = sin(flow * 6.2831853 * (0.92 + hash(aSeed * 4.0) * 0.46) + aSeed * 0.071 + uTime * 0.34);',
  '  float breath = sin(uTime * (0.42 + hash(aSeed * 6.9) * 0.42) + aSeed * 0.093);',
  '  float y = (laneBand - 2.0) * uHeight * 0.135 + curve * uHeight * (0.20 + hash(aSeed * 9.0) * 0.18) + (laneLocal - 0.5) * uHeight * 0.16 + breath * uHeight * 0.10;',
  '  float z = -0.08 + (aDepth - 0.5) * 0.44 + sin(uTime * (0.18 + hash(aSeed) * 0.24) + aSeed) * 0.08;',
  '  vec2 p = vec2(x / (uWidth * 0.60), y / (uHeight * 0.65));',
  '  vSeed = aSeed; vLane = aLane;',
  '  float edge = smoothstep(0.0, 0.18, flow) * (1.0 - smoothstep(0.82, 1.0, flow));',
  '  vGlow = edge * (0.62 + 0.38 * sin(uTime * (0.9 + hash(aSeed * 8.0) * 0.7) + aSeed));',
  '  float size = (0.030 + hash(aSeed * 12.0) * 0.040 + vGlow * 0.024 + uBeat * 0.010) * (1.0 + uBass * 0.18);',
  '  gl_PointSize = clamp(size * uPixel * 26.0, 1.0, 9.0);',
  '  gl_Position = vec4(p, 0.0, 1.0);',
  '}'
].join('\n')

const FRAG = [
  'precision highp float;',
  'uniform sampler2D uMap;',
  'uniform vec3 uColorA, uColorB;',
  'uniform float uOpacity, uTime, uBeat;',
  'varying float vSeed, vLane, vGlow;',
  'void main(){',
  '  vec4 tex = texture2D(uMap, gl_PointCoord);',
  '  if(tex.a < 0.02) discard;',
  '  float tw = pow(0.5 + 0.5 * sin(uTime * (0.55 + fract(vSeed) * 0.35) + vSeed), 4.0);',
  '  vec3 col = mix(uColorA, uColorB, smoothstep(0.12, 0.92, vLane) * 0.45 + tw * 0.42 + vGlow * 0.26);',
  '  float alpha = tex.a * uOpacity * (0.20 + vGlow * 0.78 + tw * 0.32 + uBeat * 0.10);',
  '  gl_FragColor = vec4(col * (0.82 + vGlow * 0.72 + tw * 0.32), alpha);',
  '}'
].join('\n')

/* ---------- WebGL 工具 ---------- */
function compile (type, src) {
  const sh = gl.createShader(type)
  gl.shaderSource(sh, src)
  gl.compileShader(sh)
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    console.warn('[LyricFX] shader 编译失败:', gl.getShaderInfoLog(sh))
    return null
  }
  return sh
}
function createDotTexture () {
  const s = 64
  const c = document.createElement('canvas')
  c.width = c.height = s
  const x = c.getContext('2d')
  const g = x.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2)
  g.addColorStop(0, 'rgba(255,255,255,1)')
  g.addColorStop(0.35, 'rgba(255,255,255,0.85)')
  g.addColorStop(1, 'rgba(255,255,255,0)')
  x.fillStyle = g
  x.fillRect(0, 0, s, s)
  const tex = gl.createTexture()
  gl.bindTexture(gl.TEXTURE_2D, tex)
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, c)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
  return tex
}
function hexToRgb (c) {
  const h = (c || '#5b8cff').replace('#', '')
  const n = h.length === 3 ? h.split('').map((x) => x + x).join('') : h
  return [
    parseInt(n.substring(0, 2), 16) / 255,
    parseInt(n.substring(2, 4), 16) / 255,
    parseInt(n.substring(4, 6), 16) / 255
  ]
}
function lighten ([r, g, b], t) {
  return [r + (1 - r) * t, g + (1 - g) * t, b + (1 - b) * t]
}

function initGL () {
  const c = canvas.value
  if (!c) return false
  const ctx = c.getContext('webgl', { alpha: true, premultipliedAlpha: false, antialias: true, depth: false })
  if (!ctx) { console.warn('[LyricFX] WebGL 不可用，粒子层停用'); return false }
  gl = ctx
  const vs = compile(gl.VERTEX_SHADER, VERT)
  const fs = compile(gl.FRAGMENT_SHADER, FRAG)
  if (!vs || !fs) return false
  program = gl.createProgram()
  gl.attachShader(program, vs)
  gl.attachShader(program, fs)
  gl.linkProgram(program)
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    console.warn('[LyricFX] program 链接失败:', gl.getProgramInfoLog(program))
    return false
  }
  gl.useProgram(program)

  // 粒子属性：seed / lane / depth
  const seed = new Float32Array(COUNT)
  const lane = new Float32Array(COUNT)
  const depth = new Float32Array(COUNT)
  for (let i = 0; i < COUNT; i++) {
    seed[i] = Math.random() * 1000
    lane[i] = Math.random()
    depth[i] = Math.random()
  }
  const mk = (name, arr) => {
    const b = gl.createBuffer()
    gl.bindBuffer(gl.ARRAY_BUFFER, b)
    gl.bufferData(gl.ARRAY_BUFFER, arr, gl.STATIC_DRAW)
    const loc = gl.getAttribLocation(program, name)
    gl.enableVertexAttribArray(loc)
    gl.vertexAttribPointer(loc, 1, gl.FLOAT, false, 0, 0)
  }
  mk('aSeed', seed); mk('aLane', lane); mk('aDepth', depth)

  uniform = {}
  ;['uTime', 'uBass', 'uBeat', 'uWidth', 'uHeight', 'uPixel', 'uOpacity', 'uMap', 'uColorA', 'uColorB'].forEach((k) => {
    uniform[k] = gl.getUniformLocation(program, k)
  })

  gl.uniform1i(uniform.uMap, 0)
  gl.activeTexture(gl.TEXTURE0)
  gl.bindTexture(gl.TEXTURE_2D, createDotTexture())

  gl.disable(gl.DEPTH_TEST)
  gl.enable(gl.BLEND)
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE)   // 加性发光
  return true
}

function ensureAnalyser () {
  const a = getAudio()
  if (!a) return
  if (a._tlFx) { analyser = a._tlFx.analyser; audioCtx = a._tlFx.ctx; freqData = a._tlFx.freq; return }
  try {
    const AC = window.AudioContext || window.webkitAudioContext
    if (!AC) return
    audioCtx = new AC()
    const src = audioCtx.createMediaElementSource(a)
    analyser = audioCtx.createAnalyser()
    analyser.fftSize = 256
    freqData = new Uint8Array(analyser.frequencyBinCount)
    src.connect(analyser)
    analyser.connect(audioCtx.destination)
    a._tlFx = { analyser, ctx: audioCtx, freq: freqData }
  } catch (e) { analyser = null; audioCtx = null; freqData = null }
}
function pumpEnergy () {
  if (!analyser || !audioCtx || audioCtx.state !== 'running') { energy *= 0.92; prevEnergy = energy; beat *= 0.9; return }
  analyser.getByteFrequencyData(freqData)
  let s = 0
  for (let i = 0; i < freqData.length; i++) s += freqData[i]
  const avg = s / freqData.length / 255
  energy = energy * 0.8 + avg * 0.2
  beat = beat * 0.86 + Math.max(0, energy - prevEnergy) * 5
  prevEnergy = energy
  if (beat > 1) beat = 1
}

function resize () {
  const c = canvas.value
  if (!c || !gl) return
  dpr = Math.min(2, window.devicePixelRatio || 1)
  W = c.clientWidth; H = c.clientHeight
  c.width = Math.max(1, Math.floor(W * dpr))
  c.height = Math.max(1, Math.floor(H * dpr))
  gl.viewport(0, 0, c.width, c.height)
}

function frame () {
  raf = requestAnimationFrame(frame)
  if (!gl || !program) return
  pumpEnergy()
  const t = (performance.now() - startT) / 1000
  gl.clearColor(0, 0, 0, 0)
  gl.clear(gl.COLOR_BUFFER_BIT)
  gl.useProgram(program)
  const A = hexToRgb(props.accent)
  const B = lighten(A, 0.6)
  gl.uniform1f(uniform.uTime, t)
  gl.uniform1f(uniform.uBass, energy)
  gl.uniform1f(uniform.uBeat, beat)
  gl.uniform1f(uniform.uWidth, 6.5)
  gl.uniform1f(uniform.uHeight, 2.8)
  gl.uniform1f(uniform.uPixel, dpr)
  gl.uniform1f(uniform.uOpacity, 0.9)
  gl.uniform3fv(uniform.uColorA, A)
  gl.uniform3fv(uniform.uColorB, B)
  gl.drawArrays(gl.POINTS, 0, COUNT)
}

onMounted(() => {
  if (!initGL()) return
  resize()
  ro = new ResizeObserver(resize)
  if (canvas.value) ro.observe(canvas.value)
  const arm = () => {
    ensureAnalyser()
    if (audioCtx && audioCtx.state === 'suspended') { try { audioCtx.resume() } catch (_) {} }
    window.removeEventListener('pointerdown', arm)
    window.removeEventListener('keydown', arm)
  }
  window.addEventListener('pointerdown', arm, { once: true })
  window.addEventListener('keydown', arm, { once: true })
  startT = performance.now()
  raf = requestAnimationFrame(frame)
})
onUnmounted(() => {
  cancelAnimationFrame(raf)
  if (ro) ro.disconnect()
})
</script>

<template>
  <canvas ref="canvas" class="fx"></canvas>
</template>

<style scoped>
.fx {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  z-index: 0;
  pointer-events: none;
  display: block;
}
</style>

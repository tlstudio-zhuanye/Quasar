/**
 * lyrics.js 单元自测（一次性工具）
 *   node tools/test-lyrics.mjs
 * 数据来自真实接口探测（probe-lyric 系列）
 */
import {
  parseLrcText, parseJsonLrc, parseYrcLine, parseYrc, attachTrans,
  parseLyric, lineIndexAt, wordIndexAt, wordProgress, fmtTime
} from '../src/utils/lyrics.js'

let pass = 0
let fail = 0
function eq (name, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want)
  if (ok) { pass++; console.log('  ✓ ' + name) }
  else {
    fail++
    console.log('  ✗ ' + name)
    console.log('    got : ' + JSON.stringify(got))
    console.log('    want: ' + JSON.stringify(want))
  }
}
function ok (name, cond, extra) {
  if (cond) { pass++; console.log('  ✓ ' + name) }
  else { fail++; console.log('  ✗ ' + name + (extra ? ' — ' + extra : '')) }
}

console.log('── parseLrcText（QQ 稻香真实数据）')
eq('行解析', parseLrcText('[00:30.94]对这个世界如果你有太多的抱怨'),
  [{ time: 30.94, text: '对这个世界如果你有太多的抱怨' }])
eq('多标签行', parseLrcText('[00:10.00][01:20.00]副歌'), [
  { time: 10, text: '副歌' }, { time: 80, text: '副歌' }
])
eq('空/无效行跳过', parseLrcText('[ti:稻香]\n[00:30.94]有字\n无时间行'), [
  { time: 30.94, text: '有字' }
])

console.log('── parseJsonLrc（网易云新格式真实数据）')
eq('单行', parseJsonLrc('{"t":0,"c":[{"tx":"作词: "},{"tx":"唐恬"}]}'),
  [{ time: 0, text: '作词: 唐恬' }])
eq('词间空格保留', parseJsonLrc('{"t":0,"c":[{"tx":"都 "},{"tx":"是"}]}'),
  [{ time: 0, text: '都 是' }])
eq('行首尾空白去除', parseJsonLrc('{"t":0,"c":[{"tx":"作词: "}]}'),
  [{ time: 0, text: '作词:' }])
eq('多行+排序', parseJsonLrc('{"t":1852,"c":[{"tx":"吉他: "},{"tx":"高飞"}]}\n{"t":0,"c":[{"tx":"作词: "}]}'), [
  { time: 0, text: '作词:' }, { time: 1.852, text: '吉他: 高飞' }
])

console.log('── parseYrcLine（孤勇者正文真实数据）')
{
  const l = parseYrcLine('[22310,4300](22310,2880,0)都 (25190,310,0)是(25500,290,0)勇(25790,230,0)敢(26020,590,0)的')
  ok('行头时间', Math.abs(l.time - 22.31) < 1e-6 && Math.abs(l.dur - 4.3) < 1e-6, JSON.stringify(l))
  ok('词数=5', l.words.length === 5, String(l.words.length))
  ok('整行文字', l.text === '都是勇敢的', l.text)
  ok('首词起止', Math.abs(l.words[0].start - 22.31) < 1e-6 && Math.abs(l.words[0].end - 25.19) < 1e-6,
    JSON.stringify(l.words[0]))
  ok('词2是"是"', l.words[1].text === '是', l.words[1].text)
}

console.log('── parseYrc 混合格式（yrc 字段真实结构）')
{
  const yrc = [
    '{"t":0,"c":[{"tx":"作词: "},{"tx":"唐恬","li":"http://p1.music.126.net/x.jpg","or":"orpheus://nm/artist/home?id=1"}]}',
    '{"t":0,"c":[{"tx":"作曲: "},{"tx":"钱雷"}]}',
    '[22310,4300](22310,2880,0)都 (25190,310,0)是(25500,290,0)勇(25790,230,0)敢(26020,590,0)的',
    '[28570,5400](28570,250,0)你(28820,200,0)额(29020,220,0)头(29240,180,0)的(29420,290,0)伤(29710,700,0)口'
  ].join('\n')
  const lines = parseYrc(yrc)
  ok('共4行', lines.length === 4, String(lines.length))
  ok('制作名单行无words', lines[0].words === undefined && lines[0].text === '作词: 唐恬', JSON.stringify(lines[0]))
  ok('正文行有words', Array.isArray(lines[2].words) && lines[2].words.length === 5)
  ok('按时间排序', lines.every((l, i) => i === 0 || l.time >= lines[i - 1].time))
}

console.log('── attachTrans 译文合并')
{
  const origin = [{ time: 10, text: '原文A' }, { time: 20, text: '原文B' }]
  eq('精确匹配', attachTrans(origin, [{ time: 20, text: '译文B' }, { time: 10, text: '译文A' }]),
    [{ time: 10, text: '原文A', trans: '译文A' }, { time: 20, text: '原文B', trans: '译文B' }])
  eq('就近匹配', attachTrans(origin, [{ time: 19.8, text: '译文B' }]),
    [{ time: 10, text: '原文A', trans: '' }, { time: 20, text: '原文B', trans: '译文B' }])
  eq('无译文', attachTrans(origin, []),
    [{ time: 10, text: '原文A', trans: '' }, { time: 20, text: '原文B', trans: '' }])
}

console.log('── parseLyric 总入口')
{
  const yrc = [
    '{"t":0,"c":[{"tx":"作词: "},{"tx":"唐恬"}]}',
    '[22310,4300](22310,2880,0)都 (25190,310,0)是(25500,290,0)勇(25790,230,0)敢(26020,590,0)的'
  ].join('\n')
  const lrc = ['{"t":0,"c":[{"tx":"作词: 唐恬"}]}', '{"t":22310,"c":[{"tx":"都是勇敢的"}]}'].join('\n')
  const tlyric = '{"t":22310,"c":[{"tx":"They are all brave"}]}'
  const r = parseLyric('netease', { lyric: lrc, tlyric, yrc })
  ok('网易云逐字开启', r.wordByWord === true)
  ok('2行+译文', r.lines.length === 2 && r.lines[1].trans === 'They are all brave', JSON.stringify(r.lines[1]))
  ok('首行制作名单无words', r.lines[0].words === undefined)

  const q = parseLyric('qq', {
    lyric: '[00:30.94]对这个世界如果你有太多的抱怨',
    tlyric: '[00:30.94]If you have too many complaints'
  })
  ok('QQ行级', q.wordByWord === false && q.lines.length === 1)
  ok('QQ译文', q.lines[0].trans === 'If you have too many complaints')

  const empty = parseLyric('qq', {})
  ok('空歌词安全', empty.lines.length === 0 && empty.wordByWord === false)

  const lrcOnly = parseLyric('netease', { lyric: '[00:01.00]纯LRC回退' })
  ok('网易云LRC回退', lrcOnly.lines.length === 1 && lrcOnly.lines[0].text === '纯LRC回退')
}

console.log('── 播放辅助')
{
  const lines = [
    { time: 0, text: 'A', words: null },
    { time: 10, text: 'B', words: [{ text: 'b1', start: 10, end: 12 }, { text: 'b2', start: 12, end: 15 }] }
  ]
  eq('行索引@0', lineIndexAt(lines, 0), 0)
  eq('行索引@9.8', lineIndexAt(lines, 9.8), 0)
  eq('行索引@9.9(150ms预点亮)', lineIndexAt(lines, 9.9), 1)
  eq('行索引@10.2', lineIndexAt(lines, 10.2), 1)
  eq('空歌词', lineIndexAt([], 5), -1)
  eq('词索引@10.5', wordIndexAt(lines[1], 10.5), 0)
  eq('词索引@12.5', wordIndexAt(lines[1], 12.5), 1)
  eq('词索引@16(结束)', wordIndexAt(lines[1], 16), 1)
  eq('无逐字行', wordIndexAt(lines[0], 5), -1)
  const p1 = wordProgress(lines[1], 11)
  ok('词内进度', p1.index === 0 && Math.abs(p1.progress - 0.5) < 1e-6, JSON.stringify(p1))
  eq('fmtTime', fmtTime(95), '1:35')
}

console.log(`\n结果：${pass} 通过 / ${fail} 失败`)
process.exit(fail ? 1 : 0)

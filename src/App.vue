<script setup>
import MainWindow from './views/MainWindow.vue'
import MiniPlayer from './views/MiniPlayer.vue'

// 同一个前端产物承载两个窗口：主窗 #main，WMP 式小窗 #mini
const isMini = location.hash.includes('mini')
</script>

<template>
  <MiniPlayer v-if="isMini" />
  <MainWindow v-else />
</template>

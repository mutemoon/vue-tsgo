<script setup lang="ts">
import { ref } from "vue";

const msg = ref("Hello TSGo");

function greet(name: string) {
  return `Hi, ${name}`;
}

const result = greet("World");
</script>

<template>
  <div class="container">
    <h1 @click="msg = 'Clicked'">{{ msg }}</h1>
    <p>{{ result }}</p>
  </div>
  <!-- 将鼠标移动到 greet 或 result 上，触发 Hover 定义预览 -->
  <!-- 也可测试引入：import { computed } from 'vue' 并悬浮 -->
  <!-- 也可创建 src/utils/hello.ts 并从这里导入进行跨文件跳转测试 -->
</template>

<style scoped>
.container {
  padding: 24px;
  font-family: ui-sans-serif, system-ui, -apple-system;
}
h1 {
  cursor: pointer;
}
</style>

<script setup lang="ts">
import DefaultTheme from "vitepress/theme";
import { useData } from "vitepress";
import { watchEffect } from "vue";

const { Layout } = DefaultTheme;
const { lang } = useData();

watchEffect(() => {
  if (typeof document === "undefined") return;
  const isFa = lang.value.startsWith("fa");
  document.documentElement.setAttribute("dir", isFa ? "rtl" : "ltr");
  document.documentElement.setAttribute("lang", lang.value);
  document.documentElement.classList.toggle("locale-fa", isFa);
});
</script>

<template>
  <Layout />
</template>

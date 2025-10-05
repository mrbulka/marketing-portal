<script setup>
// Root layout with simple navigation and router view
</script>

<template>
  <header class="topbar">
    <nav class="nav">
      <router-link to="/" class="nav-link">Home</router-link>
      <router-link to="/twitter" class="nav-link">Twitter</router-link>
    </nav>
  </header>

  <router-view />
</template>

<style>
/* Global resets and theme overrides */
*, *::before, *::after {
  box-sizing: border-box;
}

:root {
  color-scheme: light;
}

html, body {
  margin: 0;
  padding: 0;
  background: #f6f7fb; /* light background for better contrast */
  color: #111827;      /* slate-900 text */
}

#app {
  max-width: none;
  margin: 0;
  padding: 0;
  text-align: initial; /* avoid global center-align */
}

/* Links */
a {
  color: #2563eb;      /* blue-600 */
  text-decoration: none;
}
a:hover {
  color: #1d4ed8;      /* blue-700 */
  text-decoration: underline;
}
</style>

<style scoped>
.topbar {
  position: sticky;
  top: 0;
  z-index: 10;
  background: #1f2937; /* slate-800 */
  padding: 0.5rem 1rem;
  border-bottom: 1px solid #0f172a; /* slate-900 */
}
.nav {
  display: flex;
  gap: 1rem;
  align-items: center;
}
.nav-link {
  color: #e5e7eb;
  text-decoration: none;
  font-weight: 600;
}
.nav-link:hover {
  color: #ffffff;
  text-decoration: underline;
}
</style>

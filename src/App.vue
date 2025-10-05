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

<template>
  <main class="container">
    <h1>Marketing Portal</h1>
    <p>Use the Twitter marketing tools to generate outreach DM lists or discover leads.</p>
    <router-link class="btn" to="/twitter">Go to Twitter Marketing</router-link>
  </main>
</template>

<script setup>
// Home landing page
</script>

<style scoped>
.container {
  max-width: 880px;
  margin: 2rem auto;
  padding: 0 1rem;
}
h1 {
  margin-bottom: 0.5rem;
}
p {
  color: #555;
  margin-bottom: 1rem;
}
.btn {
  display: inline-block;
  background: #42b883;
  color: white;
  padding: 0.6rem 1rem;
  border-radius: 6px;
  text-decoration: none;
  font-weight: 600;
}
.btn:hover {
  background: #369f6d;
}
</style>

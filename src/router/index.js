import { createRouter, createWebHistory } from 'vue-router';

const routes = [
  {
    path: '/',
    name: 'Home',
    component: () => import('../pages/Home.vue'),
  },
  {
    path: '/twitter',
    name: 'Twitter',
    component: () => import('../pages/Twitter.vue'),
  },
];

const router = createRouter({
  history: createWebHistory(),
  routes,
});

export default router;

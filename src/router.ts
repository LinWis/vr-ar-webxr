import { createRouter, createWebHistory } from 'vue-router'
import XrGallery from './components/gallery/XrGallery.vue'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
 routes: [
    {
      path: '/',
      name: 'home',
      component: XrGallery
    }

  ]
})

export default router
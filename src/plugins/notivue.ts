import { createNotivue } from 'notivue'

export const notivue = createNotivue({
  limit: 3,
  notifications: {
    global: {
      duration: 3000,
    },
  },
})

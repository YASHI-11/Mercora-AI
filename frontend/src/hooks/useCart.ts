import { useQuery, useQueryClient } from '@tanstack/react-query'
import { api, getCustomerId } from '../lib/api'
import type { Cart } from '../types'

export function useCart() {
  const customerId = getCustomerId()
  const queryClient = useQueryClient()

  const { data: cart, isLoading } = useQuery({
    queryKey: ['cart', customerId],
    queryFn: async () => (await api.get<Cart>('/cart', { params: { customer_id: customerId } })).data,
  })

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['cart', customerId] })

  return { cart, isLoading, customerId, invalidate }
}

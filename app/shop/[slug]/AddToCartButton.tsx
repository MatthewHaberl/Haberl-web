'use client'

import { ShoppingCart, Check } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { useCart } from '@/lib/store/cart-context'
import type { Product } from '@/types/database'

interface Props {
  product: Product
  disabled?: boolean
}

export function AddToCartButton({ product, disabled = false }: Props) {
  const { addItem } = useCart()
  const [added, setAdded] = useState(false)

  function handleAdd() {
    addItem({
      product_id: product.id,
      slug: product.slug,
      name: product.name,
      sku: product.sku,
      category: product.category,
      brand: product.brand ?? null,
      unit_price: product.price,
      image_url: product.images?.[0] ?? null,
    })
    setAdded(true)
    setTimeout(() => setAdded(false), 2000)
  }

  return (
    <Button
      size="lg"
      variant={added ? 'outline' : 'accent'}
      onClick={handleAdd}
      disabled={disabled}
      className="w-full transition-all"
    >
      {added ? (
        <>
          <Check className="h-5 w-5 mr-2 text-green-600" />
          Added to cart
        </>
      ) : (
        <>
          <ShoppingCart className="h-5 w-5 mr-2" />
          {disabled ? 'Out of Stock' : 'Add to Cart'}
        </>
      )}
    </Button>
  )
}

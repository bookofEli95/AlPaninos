import { create } from 'zustand';

export type CartModifier = {
  optionId: string;
  name: string;
  price: number;
};

export type CartItem = {
  cartItemId: string;
  menuItemId: string;
  name: string;
  basePrice: number;
  quantity: number;
  modifiers: CartModifier[];
  totalPrice: number;
  specialInstructions?: string;
  imageUrl?: string | null;
  // Set when this line is a wheel-prize/PaninoPoints reward's free item --
  // forces totalPrice to 0 regardless of modifiers (see addFreeItem) and is
  // how Deals/Profile know a reward is actually "applied" (present in the
  // cart right now) instead of tracking a separate flag that could go stale
  // if the item is removed or the modifier-picking flow is abandoned.
  promoCode?: string;
};

interface AccountCart {
  items: CartItem[];
  locationId: string | null;
  orderType: 'pickup' | 'delivery';
  deliveryAddress: string;
}

const defaultCart: AccountCart = {
  items: [],
  locationId: null,
  orderType: 'pickup',
  deliveryAddress: '',
};

interface CartState {
  activeUserId: string;
  carts: Record<string, AccountCart>;
  items: CartItem[];
  locationId: string | null;
  orderType: 'pickup' | 'delivery';
  deliveryAddress: string;
  setActiveUser: (userId?: string | null) => void;
  setOrderType: (type: 'pickup' | 'delivery') => void;
  setDeliveryAddress: (address: string) => void;
  addItem: (item: CartItem, locationId: string) => void;
  removeItem: (cartItemId: string) => void;
  clearCart: () => void;
  incrementSimpleItem: (
    item: { menuItemId: string; name: string; basePrice: number; imageUrl?: string | null },
    locationId: string
  ) => void;
  decrementSimpleItem: (menuItemId: string) => void;
  // Sets a cart line's quantity directly (the in-cart [-] [n] [+] stepper),
  // for any line -- with modifiers or without. incrementSimpleItem/
  // decrementSimpleItem only ever handled no-modifier lines one step at a
  // time; a customized item previously had no way to change quantity short
  // of removing it and re-picking every modifier from scratch. Recomputes
  // totalPrice from the line's own per-unit price (totalPrice / quantity)
  // rather than needing a separate stored unit price field, and dropping to
  // 0 removes the line the same way decrementSimpleItem already does.
  updateItemQuantity: (cartItemId: string, quantity: number) => void;
  addFreeItem: (
    item: {
      menuItemId: string;
      name: string;
      basePrice: number;
      modifiers?: CartModifier[];
      specialInstructions?: string;
      imageUrl?: string | null;
    },
    locationId: string,
    promoCode: string
  ) => void;
  removeItemsByPromoCode: (promoCode: string) => void;
}

export const useCartStore = create<CartState>((set) => ({
  activeUserId: 'guest',
  carts: { guest: { ...defaultCart } },
  items: [],
  locationId: null,
  orderType: 'pickup',
  deliveryAddress: '',

  setActiveUser: (userId) => set((state) => {
    const key = userId || 'guest';
    const target = state.carts[key] || { ...defaultCart };
    return {
      activeUserId: key,
      items: target.items,
      locationId: target.locationId,
      orderType: target.orderType,
      deliveryAddress: target.deliveryAddress,
      carts: { ...state.carts, [key]: target },
    };
  }),

  setOrderType: (type) => set((state) => {
    const updatedCart = { ...(state.carts[state.activeUserId] || defaultCart), orderType: type };
    return {
      orderType: type,
      carts: { ...state.carts, [state.activeUserId]: updatedCart },
    };
  }),

  setDeliveryAddress: (address) => set((state) => {
    const updatedCart = { ...(state.carts[state.activeUserId] || defaultCart), deliveryAddress: address };
    return {
      deliveryAddress: address,
      carts: { ...state.carts, [state.activeUserId]: updatedCart },
    };
  }),

  addItem: (item, locationId) => set((state) => {
    const current = state.carts[state.activeUserId] || { ...defaultCart };
    const newItems = (current.locationId && current.locationId !== locationId)
      ? [item]
      : [...current.items, item];
    const updatedCart: AccountCart = {
      ...current,
      items: newItems,
      locationId,
    };
    return {
      ...updatedCart,
      carts: { ...state.carts, [state.activeUserId]: updatedCart },
    };
  }),

  removeItem: (id) => set((state) => {
    const current = state.carts[state.activeUserId] || { ...defaultCart };
    const updatedCart: AccountCart = {
      ...current,
      items: current.items.filter((i) => i.cartItemId !== id),
    };
    return {
      ...updatedCart,
      carts: { ...state.carts, [state.activeUserId]: updatedCart },
    };
  }),

  // Empties the items only -- location, order type, and delivery address are
  // context the customer is still in, not part of "the cart", and clearing
  // them too would (and did) strand navigation that relies on locationId.
  clearCart: () => set((state) => {
    const current = state.carts[state.activeUserId] || { ...defaultCart };
    const updatedCart: AccountCart = { ...current, items: [] };
    return {
      ...updatedCart,
      carts: { ...state.carts, [state.activeUserId]: updatedCart },
    };
  }),

  // For items with no modifiers (e.g. Extras): one cart line per menu item,
  // its quantity bumped up/down directly, instead of a new line each add.
  incrementSimpleItem: (item, locationId) => set((state) => {
    const current = state.carts[state.activeUserId] || { ...defaultCart };
    const existing = current.items.find((i) => i.menuItemId === item.menuItemId && i.modifiers.length === 0);

    let newItems: CartItem[];
    if (existing) {
      newItems = current.items.map((i) =>
        i.cartItemId === existing.cartItemId
          ? { ...i, quantity: i.quantity + 1, totalPrice: i.basePrice * (i.quantity + 1) }
          : i
      );
    } else {
      const newItem: CartItem = {
        cartItemId: Math.random().toString(36).substr(2, 9),
        menuItemId: item.menuItemId,
        name: item.name,
        basePrice: item.basePrice,
        quantity: 1,
        modifiers: [],
        totalPrice: item.basePrice,
        imageUrl: item.imageUrl,
      };
      newItems = (current.locationId && current.locationId !== locationId)
        ? [newItem]
        : [...current.items, newItem];
    }

    const updatedCart: AccountCart = { ...current, items: newItems, locationId };
    return {
      ...updatedCart,
      carts: { ...state.carts, [state.activeUserId]: updatedCart },
    };
  }),

  updateItemQuantity: (cartItemId, quantity) => set((state) => {
    const current = state.carts[state.activeUserId] || { ...defaultCart };

    if (quantity <= 0) {
      const updatedCart: AccountCart = {
        ...current,
        items: current.items.filter((i) => i.cartItemId !== cartItemId),
      };
      return {
        ...updatedCart,
        carts: { ...state.carts, [state.activeUserId]: updatedCart },
      };
    }

    const newItems = current.items.map((i) => {
      if (i.cartItemId !== cartItemId) return i;
      const unitPrice = i.quantity > 0 ? i.totalPrice / i.quantity : 0;
      return { ...i, quantity, totalPrice: unitPrice * quantity };
    });
    const updatedCart: AccountCart = { ...current, items: newItems };
    return {
      ...updatedCart,
      carts: { ...state.carts, [state.activeUserId]: updatedCart },
    };
  }),

  decrementSimpleItem: (menuItemId) => set((state) => {
    const current = state.carts[state.activeUserId] || { ...defaultCart };
    const existing = current.items.find((i) => i.menuItemId === menuItemId && i.modifiers.length === 0);
    if (!existing) return state;

    const newItems = existing.quantity <= 1
      ? current.items.filter((i) => i.cartItemId !== existing.cartItemId)
      : current.items.map((i) =>
          i.cartItemId === existing.cartItemId
            ? { ...i, quantity: i.quantity - 1, totalPrice: i.basePrice * (i.quantity - 1) }
            : i
        );

    const updatedCart: AccountCart = { ...current, items: newItems };
    return {
      ...updatedCart,
      carts: { ...state.carts, [state.activeUserId]: updatedCart },
    };
  }),

  // A redeemed wheel-prize/PaninoPoints reward always gets its own line
  // (never merged into an existing paid line of the same menu item) and is
  // always $0 regardless of any modifiers chosen -- the whole point of the
  // reward is that item, however customized, costs nothing.
  addFreeItem: (item, locationId, promoCode) => set((state) => {
    const current = state.carts[state.activeUserId] || { ...defaultCart };
    const newItem: CartItem = {
      cartItemId: Math.random().toString(36).substr(2, 9),
      menuItemId: item.menuItemId,
      name: item.name,
      basePrice: item.basePrice,
      quantity: 1,
      modifiers: item.modifiers || [],
      totalPrice: 0,
      specialInstructions: item.specialInstructions,
      imageUrl: item.imageUrl,
      promoCode,
    };
    const newItems = (current.locationId && current.locationId !== locationId)
      ? [newItem]
      : [...current.items, newItem];
    const updatedCart: AccountCart = { ...current, items: newItems, locationId };
    return {
      ...updatedCart,
      carts: { ...state.carts, [state.activeUserId]: updatedCart },
    };
  }),

  removeItemsByPromoCode: (promoCode) => set((state) => {
    const current = state.carts[state.activeUserId] || { ...defaultCart };
    const updatedCart: AccountCart = {
      ...current,
      items: current.items.filter((i) => i.promoCode !== promoCode),
    };
    return {
      ...updatedCart,
      carts: { ...state.carts, [state.activeUserId]: updatedCart },
    };
  }),
}));
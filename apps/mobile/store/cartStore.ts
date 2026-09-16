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
  incrementSimpleItem: (item: { menuItemId: string; name: string; basePrice: number }, locationId: string) => void;
  decrementSimpleItem: (menuItemId: string) => void;
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

  clearCart: () => set((state) => {
    const updatedCart: AccountCart = { ...defaultCart };
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
}));
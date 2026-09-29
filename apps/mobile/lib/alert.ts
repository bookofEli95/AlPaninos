import { create } from 'zustand';

// The app's own popups, in the app's colours -- the phone's built-in alert
// can't be styled. Same call shape as React Native's, so screens just
// import { Alert } from here instead:
//   Alert.alert('Sign Out', 'Are you sure?', [{ text: 'Cancel', style: 'cancel' }, { text: 'Sign Out', style: 'destructive', onPress }])
// Drawn by components/AlertHost.tsx (mounted once in app/_layout.tsx).

export type AlertButton = {
  text?: string;
  onPress?: () => void;
  style?: 'default' | 'cancel' | 'destructive';
};

export type AlertOptions = {
  // Tapping outside the popup (or Android's back button) closes it.
  cancelable?: boolean;
  onDismiss?: () => void;
};

export type AlertRequest = {
  id: number;
  title: string;
  message?: string;
  buttons: AlertButton[];
  options?: AlertOptions;
};

interface AlertState {
  // One at a time: a popup opened while another is showing waits its turn.
  queue: AlertRequest[];
  push: (request: AlertRequest) => void;
  shift: () => void;
}

export const useAlertStore = create<AlertState>((set) => ({
  queue: [],
  push: (request) => set((state) => ({ queue: [...state.queue, request] })),
  shift: () => set((state) => ({ queue: state.queue.slice(1) })),
}));

let nextId = 1;

export const Alert = {
  alert(title: string, message?: string, buttons?: AlertButton[], options?: AlertOptions) {
    useAlertStore.getState().push({
      id: nextId++,
      title,
      message,
      buttons: buttons && buttons.length ? buttons : [{ text: 'OK' }],
      options,
    });
  },
};

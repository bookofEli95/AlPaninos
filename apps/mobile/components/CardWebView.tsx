import { forwardRef, useImperativeHandle, useRef, useState } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';
import { Ionicons } from '@expo/vector-icons';
import { WEBSITE_URL } from '../lib/payments';

// The card boxes: the website's own secure card form (its /pay/card page)
// shown inside the checkout. When the order is placed, the app asks it for
// the card's one-time token (the card number never reaches the app or our
// database) -- see the website's components/checkout/card-frame.tsx.
export type CardWebViewHandle = { tokenize: () => Promise<{ token: string } | { error: string }> };

type Message =
  | { type: 'ready' }
  | { type: 'unavailable' }
  | { type: 'height'; height: number }
  | { type: 'token'; token: string }
  | { type: 'error'; error: string };

const CardWebView = forwardRef<CardWebViewHandle, { storeId: string }>(function CardWebView({ storeId }, ref) {
  const web = useRef<WebView>(null);
  const [height, setHeight] = useState(160);
  const [state, setState] = useState<'loading' | 'ready' | 'unavailable' | 'failed'>('loading');
  const waiting = useRef<((r: { token: string } | { error: string }) => void) | null>(null);

  useImperativeHandle(
    ref,
    () => ({
      tokenize: () =>
        new Promise((resolve) => {
          if (state !== 'ready') {
            resolve({ error: "The card form isn't ready yet. Please wait a moment and try again." });
            return;
          }
          const timer = setTimeout(() => {
            waiting.current = null;
            resolve({ error: "The card form didn't answer. Please try again." });
          }, 20000);
          waiting.current = (r) => {
            clearTimeout(timer);
            waiting.current = null;
            resolve(r);
          };
          web.current?.injectJavaScript('window.__alpTokenize && window.__alpTokenize(); true;');
        }),
    }),
    [state]
  );

  const onMessage = (e: WebViewMessageEvent) => {
    let m: Message;
    try {
      m = JSON.parse(e.nativeEvent.data);
    } catch {
      return;
    }
    if (m.type === 'height' && typeof m.height === 'number' && m.height > 0) setHeight(Math.min(640, Math.ceil(m.height)));
    else if (m.type === 'ready') setState('ready');
    else if (m.type === 'unavailable') setState('unavailable');
    else if (m.type === 'token') waiting.current?.({ token: String(m.token) });
    else if (m.type === 'error') waiting.current?.({ error: String(m.error) });
  };

  if (state === 'failed' || state === 'unavailable') {
    return (
      <View className="flex-row items-start bg-[#FAF6F0] rounded-xl p-3.5">
        <Ionicons name="alert-circle" size={18} color="#A61C14" />
        <Text className="text-sm text-[#1C1917] ml-2 flex-1">
          {state === 'failed'
            ? "The card form couldn't load. Check your connection, or choose to pay at the store."
            : "Card payments aren't set up yet. Please choose to pay at the store."}
        </Text>
      </View>
    );
  }

  return (
    <View style={{ height }}>
      <WebView
        ref={web}
        source={{ uri: `${WEBSITE_URL}/pay/card?store=${encodeURIComponent(storeId)}` }}
        onMessage={onMessage}
        onError={() => setState('failed')}
        onHttpError={() => setState('failed')}
        // Only the website's card page itself (the card company's own boxes
        // inside it load as frames).
        onShouldStartLoadWithRequest={(req) => req.url.startsWith(WEBSITE_URL) || req.isTopFrame === false}
        scrollEnabled={false}
        style={{ backgroundColor: 'transparent' }}
        containerStyle={{ backgroundColor: 'transparent' }}
      />
      {state === 'loading' && (
        <View className="absolute inset-0 items-center justify-center bg-white">
          <ActivityIndicator color="#A61C14" />
        </View>
      )}
    </View>
  );
});

export default CardWebView;

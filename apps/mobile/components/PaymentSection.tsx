import type { Ref } from 'react';
import { Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import CardWebView, { type CardWebViewHandle } from './CardWebView';
import { TIP_PERCENTS, tipAmount, type PayMethod, type TipChoice } from '../lib/payments';
import { tabularNums } from '../lib/typography';

// How the order's paid: by card now (with a tip), or at the store -- for
// catering, by card now or by invoice after we call. Only one way when the
// store doesn't take cards online, and then it just says so.
export default function PaymentSection({
  methods,
  method,
  onMethod,
  orderType,
  tip,
  onTip,
  beforeTax,
  storeId,
  cardRef,
}: {
  methods: PayMethod[];
  method: PayMethod;
  onMethod: (m: PayMethod) => void;
  orderType: 'pickup' | 'delivery';
  tip: TipChoice;
  onTip: (t: TipChoice) => void;
  // What a tip percentage is worked out on: the order before tax.
  beforeTax: number;
  storeId: string;
  cardRef: Ref<CardWebViewHandle>;
}) {
  const choices: Record<PayMethod, { icon: keyof typeof Ionicons.glyphMap; title: string; note: string }> = {
    online: { icon: 'card', title: 'Pay now by card', note: 'Pay securely now, nothing to pay later' },
    in_store: {
      icon: 'storefront',
      title: orderType === 'delivery' ? 'Pay when it arrives' : 'Pay at pickup',
      note: orderType === 'delivery' ? 'Pay when your order is delivered' : 'Pay at the counter when you pick it up',
    },
    invoice: { icon: 'document-text', title: 'Pay by invoice', note: 'We call to confirm, then email you an invoice' },
  };

  if (methods.length === 1) {
    const only = choices[methods[0]];
    return (
      <View className="flex-row items-start p-4 bg-white rounded-2xl border border-stone-200 mb-2">
        <Ionicons name={only.icon} size={18} color="#A61C14" />
        <View className="ml-2.5 flex-1">
          <Text className="text-sm font-inter-bold text-[#1C1917]">{only.title}</Text>
          <Text className="text-xs text-stone-500 mt-0.5">{only.note}</Text>
        </View>
      </View>
    );
  }

  const tap = (fn: () => void) => () => {
    Haptics.selectionAsync().catch(() => {});
    fn();
  };
  const tipNow = tipAmount(tip, beforeTax);
  const chip = (key: string, active: boolean, label: string, sub: string | null, onPress: () => void) => (
    <TouchableOpacity
      key={key}
      onPress={tap(onPress)}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      className={`items-center justify-center rounded-xl py-2 mb-2 border ${active ? 'bg-[#1C1917] border-[#1C1917]' : 'bg-white border-stone-300'}`}
      style={{ width: '31.5%', minHeight: 50 }}
    >
      <Text className={`text-sm font-inter-extrabold ${active ? 'text-white' : 'text-[#1C1917]'}`}>{label}</Text>
      {!!sub && (
        <Text className={`text-xs ${active ? 'text-stone-300' : 'text-stone-500'}`} style={tabularNums}>
          {sub}
        </Text>
      )}
    </TouchableOpacity>
  );

  return (
    <View className="p-4 bg-white rounded-2xl border border-stone-200 shadow-sm mb-2">
      {methods.map((m) => {
        const ch = choices[m];
        const on = method === m;
        return (
          <TouchableOpacity
            key={m}
            onPress={tap(() => onMethod(m))}
            accessibilityRole="radio"
            accessibilityState={{ checked: on }}
            className={`flex-row items-start rounded-xl p-3.5 mb-2 border-2 ${on ? 'border-[#A61C14]' : 'border-stone-200'}`}
          >
            <View
              className={`w-5 h-5 rounded-full items-center justify-center mt-0.5 border ${on ? 'bg-[#A61C14] border-[#A61C14]' : 'border-stone-300'}`}
            >
              {on && <Ionicons name="checkmark" size={13} color="#FFFFFF" />}
            </View>
            <View className="ml-3 flex-1">
              <View className="flex-row items-center">
                <Ionicons name={ch.icon} size={15} color="#A61C14" />
                <Text className="text-[15px] font-inter-bold text-[#1C1917] ml-1.5">{ch.title}</Text>
              </View>
              <Text className="text-xs text-stone-500 mt-0.5">{ch.note}</Text>
            </View>
          </TouchableOpacity>
        );
      })}

      {method === 'online' && (
        <>
          <Text className="text-xs font-inter-bold uppercase tracking-wider text-stone-500 mt-3 mb-2">Add a tip</Text>
          <View className="flex-row flex-wrap justify-between">
            {chip('none', tip.kind === 'none', 'No tip', null, () => onTip({ kind: 'none' }))}
            {TIP_PERCENTS.map((p) =>
              chip(String(p), tip.kind === 'percent' && tip.percent === p, `${p}%`, `$${tipAmount({ kind: 'percent', percent: p }, beforeTax).toFixed(2)}`, () =>
                onTip({ kind: 'percent', percent: p })
              )
            )}
            {chip('custom', tip.kind === 'custom', 'Other', tip.kind === 'custom' && tipNow > 0 ? `$${tipNow.toFixed(2)}` : null, () =>
              onTip({ kind: 'custom', amount: tip.kind === 'custom' ? tip.amount : '' })
            )}
          </View>
          {tip.kind === 'custom' && (
            <View className="flex-row items-center bg-[#FAF6F0] border border-stone-300 rounded-xl px-3 mb-1" style={{ width: 160 }}>
              <Text className="text-base font-inter-bold text-stone-500">$</Text>
              <TextInput
                value={tip.amount}
                onChangeText={(t) => onTip({ kind: 'custom', amount: t.replace(/[^0-9.]/g, '').slice(0, 7) })}
                placeholder="0.00"
                placeholderTextColor="#A8A29E"
                keyboardType="decimal-pad"
                autoFocus
                accessibilityLabel="Tip amount"
                className="flex-1 py-2.5 ml-1 text-base text-[#1C1917]"
              />
            </View>
          )}

          <Text className="text-xs font-inter-bold uppercase tracking-wider text-stone-500 mt-3 mb-2">Card</Text>
          <CardWebView ref={cardRef} storeId={storeId} />
        </>
      )}
    </View>
  );
}

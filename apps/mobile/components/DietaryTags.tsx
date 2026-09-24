import { View, Text } from 'react-native';
import { dietaryLabels } from '../lib/dietary';

// Small "Contains Nuts" / "Vegetarian" chips. Renders nothing when untagged.
export default function DietaryTags({ tags }: { tags: string[] | null | undefined }) {
  const labels = dietaryLabels(tags);
  if (labels.length === 0) return null;
  return (
    <View className="flex-row flex-wrap mt-1">
      {labels.map((label) => (
        <View
          key={label}
          className={`px-1.5 py-0.5 rounded-md mr-1 mb-0.5 border ${
            label === 'Vegetarian' ? 'bg-emerald-50 border-emerald-200' : 'bg-amber-50 border-amber-200'
          }`}
        >
          <Text className={`text-[10px] font-inter-bold ${label === 'Vegetarian' ? 'text-emerald-800' : 'text-amber-800'}`}>
            {label}
          </Text>
        </View>
      ))}
    </View>
  );
}

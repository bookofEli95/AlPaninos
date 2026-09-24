import { View, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Challenge, WEEKDAY_SHORT, challengeEndsLabel } from '../lib/challenges';

export default function ChallengeCard({ challenge }: { challenge: Challenge }) {
  const { completed, progress, target } = challenge;
  const pct = target > 0 ? Math.min(100, Math.round((progress / target) * 100)) : 0;

  return (
    <View
      className={`bg-white rounded-2xl border p-4 mb-3 shadow-sm ${completed ? 'border-emerald-300' : 'border-stone-200'}`}
    >
      <View className="flex-row items-start justify-between">
        <View className="flex-row items-center flex-1 mr-2">
          <View
            className={`w-8 h-8 rounded-full items-center justify-center mr-2.5 ${completed ? 'bg-emerald-50' : 'bg-[#FAF6F0]'}`}
          >
            <Ionicons name={completed ? 'trophy' : 'flag-outline'} size={16} color={completed ? '#047857' : '#A61C14'} />
          </View>
          <Text className="text-base font-inter-bold text-[#1C1917] flex-1">{challenge.title}</Text>
        </View>
        <View className={`px-2.5 py-1 rounded-full ${completed ? 'bg-emerald-100' : 'bg-[#A61C14]'}`}>
          <Text className={`text-[11px] font-inter-bold ${completed ? 'text-emerald-800' : 'text-[#F4ECE1]'}`}>
            +{challenge.bonus_points} pts
          </Text>
        </View>
      </View>

      {!!challenge.description && (
        <Text className="text-stone-500 text-xs leading-4 mt-2">{challenge.description}</Text>
      )}

      {challenge.kind === 'weekdays' && challenge.weekdays ? (
        <View className="flex-row flex-wrap mt-3">
          {challenge.weekdays.map((day) => {
            const done = challenge.done_days.includes(day);
            return (
              <View
                key={day}
                className={`flex-row items-center px-2.5 py-1 rounded-lg mr-1.5 mb-1 border ${
                  done ? 'bg-emerald-50 border-emerald-200' : 'bg-[#FAF6F0] border-stone-200'
                }`}
              >
                <Ionicons
                  name={done ? 'checkmark-circle' : 'ellipse-outline'}
                  size={13}
                  color={done ? '#047857' : '#A8A29E'}
                />
                <Text className={`text-xs font-inter-bold ml-1 ${done ? 'text-emerald-800' : 'text-stone-500'}`}>
                  {WEEKDAY_SHORT[day]}
                </Text>
              </View>
            );
          })}
        </View>
      ) : (
        <View className="mt-3">
          <View className="w-full bg-stone-100 h-2 rounded-full overflow-hidden">
            <View
              className={`h-full rounded-full ${completed ? 'bg-emerald-600' : 'bg-[#A61C14]'}`}
              style={{ width: `${pct}%` }}
            />
          </View>
          <Text className="text-[11px] text-stone-600 font-inter-semibold mt-1">
            {progress} of {target} days
          </Text>
        </View>
      )}

      <Text className="text-[11px] text-[#78716C] mt-2">
        {completed
          ? `Done! ${challenge.bonus_points} bonus points added to your balance.`
          : `Orders of $${Number(challenge.min_subtotal).toFixed(0)}+ count once completed • ${challengeEndsLabel(challenge.period_end)}`}
      </Text>
    </View>
  );
}

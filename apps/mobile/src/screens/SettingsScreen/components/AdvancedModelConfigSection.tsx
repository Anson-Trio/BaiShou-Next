import React, { useState } from 'react'
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native'
import { useTranslation } from 'react-i18next'
import { useNativeTheme, Input } from '@baishou/ui/native'
import { MdExpandMore, MdExpandLess } from 'react-icons/md'
import type { AiProviderAdvancedConfig } from '@baishou/shared'

export interface AdvancedModelConfigSectionProps {
  value: AiProviderAdvancedConfig | undefined
  onChange: (config: AiProviderAdvancedConfig) => void
}

export const AdvancedModelConfigSection: React.FC<AdvancedModelConfigSectionProps> = ({
  value = {},
  onChange
}) => {
  const { t } = useTranslation()
  const { colors } = useNativeTheme()
  const [isExpanded, setIsExpanded] = useState(false)

  const handleNumberChange = (field: keyof AiProviderAdvancedConfig, rawValue: string) => {
    // 空字符串时删除该字段
    if (rawValue === '') {
      const newConfig = { ...value }
      delete newConfig[field]
      onChange(newConfig)
      return
    }

    const numValue = parseFloat(rawValue)
    if (!isNaN(numValue)) {
      onChange({
        ...value,
        [field]: numValue
      })
    }
  }

  const cardStyle = {
    backgroundColor: colors.bgSurface,
    borderRadius: 12
  }

  return (
    <View style={[styles.container, cardStyle]}>
      <TouchableOpacity
        style={styles.header}
        onPress={() => setIsExpanded(!isExpanded)}
        activeOpacity={0.7}
      >
        <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>
          {t('ai_config.advanced_config', '高级参数')}
        </Text>
        {isExpanded ? (
          <MdExpandLess size={24} color={colors.textSecondary} />
        ) : (
          <MdExpandMore size={24} color={colors.textSecondary} />
        )}
      </TouchableOpacity>

      {isExpanded && (
        <View style={styles.fieldsContainer}>
          <Text style={[styles.helpText, { color: colors.textTertiary }]}>
            {t(
              'ai_config.advanced_config_help',
              '调整模型的采样参数。留空表示使用模型默认值。不同提供商支持的参数有所不同。'
            )}
          </Text>

          {/* Temperature */}
          <View style={styles.fieldItem}>
            <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>
              {t('ai_config.temperature', 'Temperature')}
            </Text>
            <Text style={[styles.fieldHint, { color: colors.textTertiary }]}>
              {t('ai_config.temperature_help', '控制输出随机性。范围 0-2，值越高输出越随机。')}
            </Text>
            <Input
              value={value.temperature?.toString() ?? ''}
              onChangeText={(text) => handleNumberChange('temperature', text)}
              placeholder={t('ai_config.default_value', '默认')}
              keyboardType="numeric"
            />
          </View>

          {/* TopK */}
          <View style={styles.fieldItem}>
            <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>
              {t('ai_config.topK', 'Top K')}
            </Text>
            <Text style={[styles.fieldHint, { color: colors.textTertiary }]}>
              {t('ai_config.topK_help', '从概率最高的 K 个词中采样。范围 1-100。')}
            </Text>
            <Input
              value={value.topK?.toString() ?? ''}
              onChangeText={(text) => handleNumberChange('topK', text)}
              placeholder={t('ai_config.default_value', '默认')}
              keyboardType="numeric"
            />
          </View>

          {/* TopP */}
          <View style={styles.fieldItem}>
            <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>
              {t('ai_config.topP', 'Top P')}
            </Text>
            <Text style={[styles.fieldHint, { color: colors.textTertiary }]}>
              {t('ai_config.topP_help', '累计概率阈值采样。范围 0-1，值越小输出越确定。')}
            </Text>
            <Input
              value={value.topP?.toString() ?? ''}
              onChangeText={(text) => handleNumberChange('topP', text)}
              placeholder={t('ai_config.default_value', '默认')}
              keyboardType="numeric"
            />
          </View>

          {/* MaxTokens */}
          <View style={styles.fieldItem}>
            <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>
              {t('ai_config.maxTokens', 'Max Tokens')}
            </Text>
            <Text style={[styles.fieldHint, { color: colors.textTertiary }]}>
              {t('ai_config.maxTokens_help', '最大输出 token 数。范围 1-32000。')}
            </Text>
            <Input
              value={value.maxTokens?.toString() ?? ''}
              onChangeText={(text) => handleNumberChange('maxTokens', text)}
              placeholder={t('ai_config.default_value', '默认')}
              keyboardType="numeric"
            />
          </View>

          {/* Frequency Penalty */}
          <View style={styles.fieldItem}>
            <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>
              {t('ai_config.frequencyPenalty', 'Frequency Penalty')}
            </Text>
            <Text style={[styles.fieldHint, { color: colors.textTertiary }]}>
              {t('ai_config.frequencyPenalty_help', '降低重复词汇的概率。范围 -2.0 至 2.0。')}
            </Text>
            <Input
              value={value.frequencyPenalty?.toString() ?? ''}
              onChangeText={(text) => handleNumberChange('frequencyPenalty', text)}
              placeholder={t('ai_config.default_value', '默认')}
              keyboardType="numeric"
            />
          </View>

          {/* Presence Penalty */}
          <View style={styles.fieldItem}>
            <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>
              {t('ai_config.presencePenalty', 'Presence Penalty')}
            </Text>
            <Text style={[styles.fieldHint, { color: colors.textTertiary }]}>
              {t('ai_config.presencePenalty_help', '鼓励模型讨论新话题。范围 -2.0 至 2.0。')}
            </Text>
            <Input
              value={value.presencePenalty?.toString() ?? ''}
              onChangeText={(text) => handleNumberChange('presencePenalty', text)}
              placeholder={t('ai_config.default_value', '默认')}
              keyboardType="numeric"
            />
          </View>
        </View>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    marginTop: 16,
    overflow: 'hidden'
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '600'
  },
  fieldsContainer: {
    paddingHorizontal: 16,
    paddingBottom: 16,
    gap: 16
  },
  helpText: {
    fontSize: 13,
    lineHeight: 18,
    marginBottom: 8
  },
  fieldItem: {
    gap: 6
  },
  fieldLabel: {
    fontSize: 14,
    fontWeight: '500'
  },
  fieldHint: {
    fontSize: 12,
    lineHeight: 16
  }
})

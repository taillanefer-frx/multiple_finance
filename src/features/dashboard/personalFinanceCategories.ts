import type { PersonalTransactionType } from './types'

export interface PersonalCategoryDefinition {
  key: string
  label: string
  color: string
  terms: string[]
}

export const expenseCategories: PersonalCategoryDefinition[] = [
  { key: 'housing', label: 'Moradia', color: '#6F7F72', terms: ['moradia', 'aluguel', 'condomínio', 'condominio'] },
  { key: 'market', label: 'Mercado', color: '#E46D78', terms: ['mercado', 'supermercado'] },
  { key: 'food', label: 'Alimentação', color: '#E59A5A', terms: ['alimentação', 'alimentacao', 'restaurante', 'comida', 'delivery'] },
  { key: 'transport', label: 'Transporte', color: '#5D84C6', terms: ['transporte', 'combustível', 'combustivel', 'uber', 'ônibus', 'onibus'] },
  { key: 'health', label: 'Saúde', color: '#A66DB0', terms: ['saúde', 'saude', 'farmácia', 'farmacia', 'médico', 'medico'] },
  { key: 'home', label: 'Casa', color: '#33A69A', terms: ['casa', 'luz', 'energia', 'internet', 'gás', 'gas', 'limpeza', 'manutenção', 'manutencao'] },
  { key: 'subscriptions', label: 'Assinaturas', color: '#B482C5', terms: ['assinatura', 'streaming', 'mensalidade'] },
  { key: 'leisure', label: 'Lazer', color: '#E66BA5', terms: ['lazer', 'cinema', 'viagem', 'passeio'] },
  { key: 'education', label: 'Educação', color: '#D1A43B', terms: ['educação', 'educacao', 'curso', 'livro'] },
  { key: 'other', label: 'Outros', color: '#8B938E', terms: [] },
]

export const incomeCategories: PersonalCategoryDefinition[] = [
  { key: 'salary', label: 'Salário', color: '#2F8A62', terms: ['salário', 'salario'] },
  { key: 'freelance', label: 'Freelance', color: '#4A9B76', terms: ['freelance', 'extra'] },
  { key: 'benefits', label: 'Benefícios', color: '#5B8E76', terms: ['benefício', 'beneficio'] },
  { key: 'returns', label: 'Rendimentos', color: '#3A846A', terms: ['rendimento', 'juros', 'investimento'] },
  { key: 'refund', label: 'Reembolso', color: '#6AA487', terms: ['reembolso', 'devolução', 'devolucao'] },
  { key: 'other-income', label: 'Outras entradas', color: '#78998A', terms: [] },
]

function normalize(value: string) {
  return value.trim().toLocaleLowerCase('pt-BR')
}

export function categoryDefinition(category: string, type: PersonalTransactionType) {
  const definitions = type === 'income' ? incomeCategories : expenseCategories
  const normalized = normalize(category)
  return definitions.find((item) => normalize(item.label) === normalized || item.terms.some((term) => normalized.includes(term)))
    ?? definitions[definitions.length - 1]
}

import * as z from 'zod'

import type { I18nLike, I18nT } from '~/utils/i18n-like'

export type SettingsI18nT = I18nT
export type SettingsI18nLike = I18nLike

export interface BaseSettingsFieldDef {
  label: SettingsI18nLike
  description?: SettingsI18nLike
  immediate?: boolean
  experimental?: boolean
  visibleWhen?: string
}

export interface SwitchFieldDef extends BaseSettingsFieldDef {
  type: 'switch'
  default: boolean
}

export interface SelectFieldOption<TValue extends string = string> {
  value: TValue
  label: SettingsI18nLike
}

export interface SelectFieldDef<
  TOptions extends readonly [SelectFieldOption<string>, ...SelectFieldOption<string>[]] = readonly [SelectFieldOption<string>, ...SelectFieldOption<string>[]],
> extends BaseSettingsFieldDef {
  type: 'select'
  default: TOptions[number]['value']
  options: TOptions
  placeholder?: SettingsI18nLike
}

export interface InputFieldDef extends BaseSettingsFieldDef {
  type: 'input'
  default: string
  placeholder?: SettingsI18nLike
}

export interface NumberFieldDef extends BaseSettingsFieldDef {
  type: 'number'
  default: number
  min?: number
  max?: number
}

export interface FolderPickerFieldDef extends BaseSettingsFieldDef {
  type: 'folderPicker'
  default: string
  buttonLabel?: SettingsI18nLike
  dialogTitle?: SettingsI18nLike
}

export type SettingsFieldDef =
  | SwitchFieldDef
  | SelectFieldDef
  | InputFieldDef
  | NumberFieldDef
  | FolderPickerFieldDef

export type SettingsFieldCollection = Record<string, SettingsFieldDef>

export interface SettingsGroup<TFields extends SettingsFieldCollection = SettingsFieldCollection> {
  label?: SettingsI18nLike
  fields: TFields
}

export type SettingsSchema = Record<string, SettingsGroup>

type MergeIntersection<TValue> =
  (TValue extends unknown ? (value: TValue) => void : never) extends (value: infer TIntersection) => void
    ? TIntersection
    : never

type SchemaGroupValues<TGroup extends SettingsGroup> = {
  [TFieldName in keyof TGroup['fields'] & string]: SettingsFieldValue<Extract<TGroup['fields'][TFieldName], SettingsFieldDef>>
}

export type SettingsFieldValue<TField extends SettingsFieldDef> =
  TField extends SwitchFieldDef ? boolean
    : TField extends InputFieldDef | FolderPickerFieldDef ? string
      : TField extends NumberFieldDef ? number
        : TField extends SelectFieldDef<infer TOptions> ? TOptions[number]['value']
          : never

export type SettingsValues<TSchema extends SettingsSchema> = MergeIntersection<{
  [TGroupName in keyof TSchema]: SchemaGroupValues<TSchema[TGroupName]>
}[keyof TSchema]>

type SchemaFieldName<TSchema extends SettingsSchema> = keyof SettingsValues<TSchema> & string

type SettingsZodShape<TSchema extends SettingsSchema> = {
  [TName in SchemaFieldName<TSchema>]: z.ZodType<SettingsValues<TSchema>[TName]>
}

export interface DefinedSettingsSchema<TSchema extends SettingsSchema> {
  schema: TSchema
  defaults: SettingsValues<TSchema>
  validationSchema: z.ZodObject<SettingsZodShape<TSchema>>
  fieldNames: SchemaFieldName<TSchema>[]
  immediateFields: SchemaFieldName<TSchema>[]
}

function flattenSettingsFields(schema: SettingsSchema): [string, SettingsFieldDef][] {
  const entries: [string, SettingsFieldDef][] = []

  for (const group of Object.values(schema)) {
    entries.push(...Object.entries(group.fields))
  }

  return entries
}

function fieldToZod<TField extends SettingsFieldDef>(field: TField): z.ZodType<SettingsFieldValue<TField>> {
  switch (field.type) {
    case 'switch': {
      return z.boolean() as unknown as z.ZodType<SettingsFieldValue<TField>>
    }
    case 'input':
    case 'folderPicker': {
      return z.string() as unknown as z.ZodType<SettingsFieldValue<TField>>
    }
    case 'number': {
      let schema = z.number()

      if (field.min !== undefined) {
        schema = schema.min(field.min)
      }

      if (field.max !== undefined) {
        schema = schema.max(field.max)
      }

      return schema as unknown as z.ZodType<SettingsFieldValue<TField>>
    }
    case 'select': {
      const values = field.options.map(option => option.value) as [string, ...string[]]
      return z.enum(values) as unknown as z.ZodType<SettingsFieldValue<TField>>
    }
    default: {
      throw new Error(`Unsupported settings field type: ${String(field satisfies never)}`)
    }
  }
}

export function defineSettingsSchema<TSchema extends SettingsSchema>(schema: TSchema): DefinedSettingsSchema<TSchema> {
  const defaults: Record<string, unknown> = {}
  const validationShape: Record<string, z.ZodType> = {}
  const fieldNames: string[] = []
  const immediateFields: string[] = []

  for (const [fieldName, field] of flattenSettingsFields(schema)) {
    if (Object.hasOwn(defaults, fieldName)) {
      throw new Error(`Duplicate settings field name: ${fieldName}`)
    }

    fieldNames.push(fieldName)
    defaults[fieldName] = field.default
    validationShape[fieldName] = fieldToZod(field)

    if (field.immediate) {
      immediateFields.push(fieldName)
    }
  }

  return {
    schema,
    defaults: defaults as SettingsValues<TSchema>,
    validationSchema: z.object(validationShape) as z.ZodObject<SettingsZodShape<TSchema>>,
    fieldNames: fieldNames as SchemaFieldName<TSchema>[],
    immediateFields: immediateFields as SchemaFieldName<TSchema>[],
  }
}

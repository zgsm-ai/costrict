/* eslint-disable @typescript-eslint/no-explicit-any */
export type TranslationResource = Record<string, any>
export type NamespaceResources = Record<string, TranslationResource>
export type LanguageResources = Record<string, NamespaceResources>

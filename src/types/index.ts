/**
 * Shared types for the application
 * These will be properly defined when we build out the hooks in Phase 5
 */

export interface View {
  id: string;
  name: string;
  program: string;
  isDefault: boolean;
  isEditable: boolean;
  accounts?: ViewAccount[];
}

export interface ViewAccount {
  pubkey: string;
  type?: string;
}

export interface LabelMeta {
  label: string;
  isDefault: boolean;
}

export interface AccountMeta {
  pubkey: string;
  label?: string;
  isFavorite: boolean;
  /** Whether the label is a default (non-editable) label */
  isLabelDefault?: boolean;
}

/**
 * IDL Schema Parser
 * 
 * Parses Anchor IDL to extract field information and calculate byte offsets
 * for use with Solana's getProgramAccounts memcmp filters.
 */

import type { Idl } from "@coral-xyz/anchor";

// Primitive type sizes in bytes (Borsh encoding, little-endian)
const PRIMITIVE_SIZES: Record<string, number> = {
  bool: 1,
  u8: 1,
  i8: 1,
  u16: 2,
  i16: 2,
  u32: 4,
  i32: 4,
  f32: 4,
  u64: 8,
  i64: 8,
  f64: 8,
  u128: 16,
  i128: 16,
  pubkey: 32,
};

// Filterable primitive types
export type PrimitiveType = 
  | "bool" 
  | "u8" | "i8" 
  | "u16" | "i16" 
  | "u32" | "i32" 
  | "u64" | "i64" 
  | "u128" | "i128" 
  | "pubkey";

export interface FieldInfo {
  name: string;
  type: IdlType;
  offset: number;           // byte offset within the parent struct
  size: number;             // byte size of field
  isArray: boolean;
  arrayLength?: number;     // if array, the fixed length
  isFilterable: boolean;    // true for primitives/pubkeys, false for structs
  isPadding: boolean;       // true for _pad*, _padding fields
  definedTypeName?: string; // if this is a defined type, the type name
}

// IDL type representations
type IdlType = 
  | string 
  | { defined: { name: string } }
  | { array: [IdlType, number] }
  | { option: IdlType }
  | { vec: IdlType };

interface IdlField {
  name: string;
  type: IdlType;
  docs?: string[];
}

interface IdlTypeDef {
  name: string;
  type: {
    kind: "struct" | "enum";
    fields?: IdlField[];
  };
  repr?: { kind: string };
  serialization?: string;
}

/**
 * Check if a field name is a padding field
 */
function isPaddingField(name: string): boolean {
  return name.startsWith("_pad") || name.startsWith("_padding");
}

/**
 * Check if a type is a primitive type
 */
function isPrimitive(type: IdlType): type is string {
  return typeof type === "string" && type in PRIMITIVE_SIZES;
}

/**
 * Check if a type is a defined type reference
 */
function isDefinedType(type: IdlType): type is { defined: { name: string } } {
  return typeof type === "object" && "defined" in type;
}

/**
 * Check if a type is an array type
 */
function isArrayType(type: IdlType): type is { array: [IdlType, number] } {
  return typeof type === "object" && "array" in type;
}

/**
 * Check if a type is an option type
 */
function isOptionType(type: IdlType): type is { option: IdlType } {
  return typeof type === "object" && "option" in type;
}

/**
 * Get type definition from IDL by name
 */
function getTypeDef(idl: Idl, typeName: string): IdlTypeDef | undefined {
  const types = (idl as { types?: IdlTypeDef[] }).types;
  if (!types) return undefined;
  return types.find((t) => t.name === typeName);
}

/**
 * Calculate the byte size of a type
 */
export function getTypeSize(idl: Idl, type: IdlType): number {
  // Primitive types
  if (isPrimitive(type)) {
    return PRIMITIVE_SIZES[type];
  }

  // Defined types - look up and calculate
  if (isDefinedType(type)) {
    const typeDef = getTypeDef(idl, type.defined.name);
    if (!typeDef || typeDef.type.kind !== "struct" || !typeDef.type.fields) {
      // Unknown type, can't calculate
      return 0;
    }
    
    let size = 0;
    for (const field of typeDef.type.fields) {
      size += getTypeSize(idl, field.type as IdlType);
    }
    return size;
  }

  // Array types
  if (isArrayType(type)) {
    const [elementType, length] = type.array;
    return getTypeSize(idl, elementType) * length;
  }

  // Option types - 1 byte discriminant + value size
  if (isOptionType(type)) {
    return 1 + getTypeSize(idl, type.option);
  }

  return 0;
}

/**
 * Get the primitive type name for a type (resolving defined types)
 */
export function resolvePrimitiveType(idl: Idl, type: IdlType): PrimitiveType | null {
  if (isPrimitive(type)) {
    return type as PrimitiveType;
  }
  
  // Can't resolve complex types to primitives
  return null;
}

/**
 * Get fields for a type definition
 */
export function getTypeFields(idl: Idl, typeName: string): FieldInfo[] {
  const typeDef = getTypeDef(idl, typeName);
  if (!typeDef || typeDef.type.kind !== "struct" || !typeDef.type.fields) {
    return [];
  }

  const fields: FieldInfo[] = [];
  let offset = 0;

  for (const field of typeDef.type.fields) {
    const type = field.type as IdlType;
    const size = getTypeSize(idl, type);
    const isPadding = isPaddingField(field.name);
    const isArray = isArrayType(type);
    const isOption = isOptionType(type);
    
    // Determine if this field is filterable (primitive or pubkey)
    let isFilterable = isPrimitive(type);
    let definedTypeName: string | undefined;
    
    if (isDefinedType(type)) {
      definedTypeName = type.defined.name;
      isFilterable = false; // Structs aren't directly filterable
    }
    
    // Option types are not filterable (too complex)
    if (isOption) {
      isFilterable = false;
    }

    fields.push({
      name: field.name,
      type,
      offset,
      size,
      isArray,
      arrayLength: isArray ? type.array[1] : undefined,
      isFilterable,
      isPadding,
      definedTypeName,
    });

    offset += size;
  }

  return fields;
}

/**
 * Get fields for an account type (top-level fields)
 * Excludes padding fields for UI display
 */
export function getAccountFields(idl: Idl, accountType: string): FieldInfo[] {
  const fields = getTypeFields(idl, accountType);
  // Filter out padding fields for the UI
  return fields.filter((f) => !f.isPadding);
}

/**
 * Get the element type of an array field
 */
export function getArrayElementType(idl: Idl, type: IdlType): { type: IdlType; typeName?: string } | null {
  if (!isArrayType(type)) return null;
  
  const elementType = type.array[0];
  
  if (isDefinedType(elementType)) {
    return { type: elementType, typeName: elementType.defined.name };
  }
  
  return { type: elementType };
}

/**
 * Calculate the byte offset for a field path within an account
 * 
 * @param idl - The IDL
 * @param accountType - The account type name (e.g., "MarginfiAccount")
 * @param fieldPath - Array of field names/indices (e.g., ["lending_account", "balances", "0", "bank_pk"])
 * @returns The byte offset from the start of the account data (after discriminator)
 */
export function calculateFieldOffset(
  idl: Idl,
  accountType: string,
  fieldPath: string[]
): number | null {
  if (fieldPath.length === 0) return null;

  let currentTypeName = accountType;
  let totalOffset = 0;

  for (let i = 0; i < fieldPath.length; i++) {
    const pathPart = fieldPath[i];
    const fields = getTypeFields(idl, currentTypeName);
    
    // Check if this is an array index
    const arrayIndex = parseInt(pathPart, 10);
    if (!isNaN(arrayIndex)) {
      // This path part is an array index
      // The previous field should have been an array
      // We need to add (index * element_size) to the offset
      // But we need the element type from the parent
      // This is handled by the previous iteration setting up the array
      continue;
    }

    // Find the field
    const field = fields.find((f) => f.name === pathPart);
    if (!field) {
      console.error(`Field not found: ${pathPart} in ${currentTypeName}`);
      return null;
    }

    totalOffset += field.offset;

    // Check if next part is an array index
    const nextPart = fieldPath[i + 1];
    const nextIndex = nextPart ? parseInt(nextPart, 10) : NaN;

    if (field.isArray && !isNaN(nextIndex)) {
      // Add offset for array index
      const elementType = getArrayElementType(idl, field.type);
      if (!elementType) return null;
      
      const elementSize = getTypeSize(idl, elementType.type);
      totalOffset += nextIndex * elementSize;

      // Move to element type for next iteration
      if (elementType.typeName) {
        currentTypeName = elementType.typeName;
      } else {
        // Primitive array element - this should be the end
        if (i + 2 < fieldPath.length) {
          console.error("Cannot traverse into primitive array element");
          return null;
        }
      }
    } else if (field.definedTypeName) {
      // Move into the defined type
      currentTypeName = field.definedTypeName;
    } else if (i < fieldPath.length - 1) {
      // Not the last part, but can't traverse further
      console.error(`Cannot traverse into ${pathPart} (type: ${JSON.stringify(field.type)})`);
      return null;
    }
  }

  return totalOffset;
}

/**
 * Get the final field type for a field path
 */
export function getFieldType(
  idl: Idl,
  accountType: string,
  fieldPath: string[]
): PrimitiveType | null {
  if (fieldPath.length === 0) return null;

  let currentTypeName = accountType;

  for (let i = 0; i < fieldPath.length; i++) {
    const pathPart = fieldPath[i];
    const fields = getTypeFields(idl, currentTypeName);

    // Check if this is an array index
    const arrayIndex = parseInt(pathPart, 10);
    if (!isNaN(arrayIndex)) {
      continue; // Skip indices, handled by previous field
    }

    const field = fields.find((f) => f.name === pathPart);
    if (!field) return null;

    // Check if next part is an array index
    const nextPart = fieldPath[i + 1];
    const nextIndex = nextPart ? parseInt(nextPart, 10) : NaN;

    if (field.isArray && !isNaN(nextIndex)) {
      const elementType = getArrayElementType(idl, field.type);
      if (!elementType) return null;

      if (elementType.typeName) {
        currentTypeName = elementType.typeName;
      } else {
        // Primitive array - return the element type
        return resolvePrimitiveType(idl, elementType.type);
      }
    } else if (field.definedTypeName) {
      currentTypeName = field.definedTypeName;
    } else {
      // This is the final field
      return resolvePrimitiveType(idl, field.type);
    }
  }

  return null;
}

/**
 * Encode a value for memcmp filter based on its type
 */
export function encodeFilterValue(value: string, type: PrimitiveType): Buffer | null {
  try {
    switch (type) {
      case "pubkey": {
        // Base58 decode - using require for dynamic import in both client/server contexts
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const bs58 = require("bs58");
        const decoded = bs58.default.decode(value);
        if (decoded.length !== 32) return null;
        return Buffer.from(decoded);
      }
      
      case "bool": {
        const boolVal = value.toLowerCase() === "true" || value === "1";
        return Buffer.from([boolVal ? 1 : 0]);
      }
      
      case "u8":
      case "i8": {
        const num = parseInt(value, 10);
        if (isNaN(num)) return null;
        const buf = Buffer.alloc(1);
        if (type === "u8") buf.writeUInt8(num);
        else buf.writeInt8(num);
        return buf;
      }
      
      case "u16":
      case "i16": {
        const num = parseInt(value, 10);
        if (isNaN(num)) return null;
        const buf = Buffer.alloc(2);
        if (type === "u16") buf.writeUInt16LE(num);
        else buf.writeInt16LE(num);
        return buf;
      }
      
      case "u32":
      case "i32": {
        const num = parseInt(value, 10);
        if (isNaN(num)) return null;
        const buf = Buffer.alloc(4);
        if (type === "u32") buf.writeUInt32LE(num);
        else buf.writeInt32LE(num);
        return buf;
      }
      
      case "u64":
      case "i64": {
        const num = BigInt(value);
        const buf = Buffer.alloc(8);
        if (type === "u64") buf.writeBigUInt64LE(num);
        else buf.writeBigInt64LE(num);
        return buf;
      }
      
      case "u128":
      case "i128": {
        const num = BigInt(value);
        const buf = Buffer.alloc(16);
        // Write as two 64-bit parts (little-endian)
        buf.writeBigUInt64LE(num & BigInt("0xFFFFFFFFFFFFFFFF"), 0);
        buf.writeBigUInt64LE(num >> BigInt(64), 8);
        return buf;
      }
      
      default:
        return null;
    }
  } catch (e) {
    console.error("Error encoding filter value:", e);
    return null;
  }
}

/**
 * Validate a filter value based on its type
 */
export function validateFilterValue(value: string, type: PrimitiveType): boolean {
  if (!value || value.trim() === "") return false;
  
  switch (type) {
    case "pubkey":
      // Basic base58 validation (32-44 chars, valid chars)
      return /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(value);
    
    case "bool":
      return ["true", "false", "0", "1"].includes(value.toLowerCase());
    
    case "u8":
    case "u16":
    case "u32":
    case "u64":
    case "u128": {
      const num = BigInt(value);
      return num >= 0;
    }
    
    case "i8":
    case "i16":
    case "i32":
    case "i64":
    case "i128": {
      try {
        BigInt(value);
        return true;
      } catch {
        return false;
      }
    }
    
    default:
      return false;
  }
}

/**
 * Format a field path for display
 * e.g., ["lending_account", "balances", "0", "bank_pk"] => "lending_account.balances[0].bank_pk"
 */
export function formatFieldPath(fieldPath: string[]): string {
  let result = "";
  
  for (let i = 0; i < fieldPath.length; i++) {
    const part = fieldPath[i];
    const isIndex = !isNaN(parseInt(part, 10));
    
    if (isIndex) {
      result += `[${part}]`;
    } else {
      if (result && !result.endsWith("]")) {
        result += ".";
      } else if (result.endsWith("]")) {
        result += ".";
      }
      result += part;
    }
  }
  
  return result;
}

/**
 * Get display name for a primitive type
 */
export function getTypeDisplayName(type: PrimitiveType): string {
  switch (type) {
    case "pubkey": return "Public Key";
    case "bool": return "Boolean";
    default: return type.toUpperCase();
  }
}

/**
 * Get placeholder text for a primitive type
 */
export function getTypePlaceholder(type: PrimitiveType): string {
  switch (type) {
    case "pubkey": return "Enter public key (base58)...";
    case "bool": return "Select true or false";
    case "u8": return "Enter number (0-255)";
    case "i8": return "Enter number (-128 to 127)";
    case "u16": return "Enter number (0-65535)";
    case "i16": return "Enter number";
    case "u32": return "Enter number";
    case "i32": return "Enter number";
    case "u64": return "Enter number";
    case "i64": return "Enter number";
    case "u128": return "Enter number";
    case "i128": return "Enter number";
    default: return "Enter value...";
  }
}

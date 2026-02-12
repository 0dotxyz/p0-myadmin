"use client";

import { useState, useEffect, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Filter, X, ChevronRight, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Idl } from "@coral-xyz/anchor";
import type { ProgramId } from "@/lib/config";
import type { AccountFilter } from "@/hooks/use-filtered-accounts";
import {
  getAccountFields,
  getTypeFields,
  getArrayElementType,
  getFieldType,
  formatFieldPath,
  getTypePlaceholder,
  validateFilterValue,
  type FieldInfo,
  type PrimitiveType,
} from "@/lib/utils/idl-schema";

interface AccountFilterProps {
  programId: ProgramId;
  accountType: string;
  idl: Idl;
  filter: AccountFilter | null;
  onApplyFilter: (filter: AccountFilter) => void;
  onClearFilter: () => void;
  loading?: boolean;
  disabled?: boolean;
}

interface FieldSelection {
  fieldName: string;
  fieldInfo: FieldInfo;
  arrayIndex?: string; // If this field is an array, the selected index
}

export function AccountFilterButton({
  programId: _programId,
  accountType,
  idl,
  filter,
  onApplyFilter,
  onClearFilter,
  loading = false,
  disabled = false,
}: AccountFilterProps) {
  // programId reserved for potential future use (e.g., program-specific field handling)
  void _programId;
  const [open, setOpen] = useState(false);
  
  // Selections at each level of the field path (with embedded array indices)
  const [selections, setSelections] = useState<FieldSelection[]>([]);
  const [filterValue, setFilterValue] = useState("");
  const [validationError, setValidationError] = useState<string | null>(null);

  // Reset selections when account type changes
  useEffect(() => {
    setSelections([]);
    setFilterValue("");
    setValidationError(null);
  }, [accountType]);

  // Get the last selection (if any)
  const lastSelection = selections.length > 0 ? selections[selections.length - 1] : null;

  // Check if we need an array index for the last selection
  const needsArrayIndex = useMemo(() => {
    if (!lastSelection) return false;
    // Need index if it's an array and we haven't selected an index yet
    return lastSelection.fieldInfo.isArray && lastSelection.arrayIndex === undefined;
  }, [lastSelection]);

  // Get fields for the current selection level
  const currentFields = useMemo(() => {
    if (selections.length === 0) {
      // Top level - get account fields
      return getAccountFields(idl, accountType);
    }

    if (!lastSelection) return [];
    
    // If last selection is an array WITH an index, get element type fields
    if (lastSelection.fieldInfo.isArray && lastSelection.arrayIndex !== undefined) {
      const elementType = getArrayElementType(idl, lastSelection.fieldInfo.type);
      if (elementType?.typeName) {
        return getTypeFields(idl, elementType.typeName).filter(f => !f.isPadding);
      }
      return []; // Primitive array, no more fields
    }

    // If last selection is a struct (not array), get its fields
    if (lastSelection.fieldInfo.definedTypeName && !lastSelection.fieldInfo.isArray) {
      return getTypeFields(idl, lastSelection.fieldInfo.definedTypeName).filter(f => !f.isPadding);
    }

    return [];
  }, [idl, accountType, selections, lastSelection]);

  // Check if we've reached a filterable (primitive) field
  const isFilterableField = useMemo(() => {
    if (!lastSelection) return false;
    
    // If it's an array, check if we have an index and what the element type is
    if (lastSelection.fieldInfo.isArray) {
      if (lastSelection.arrayIndex === undefined) return false;
      const elementType = getArrayElementType(idl, lastSelection.fieldInfo.type);
      if (!elementType) return false;
      // If element is a struct, not yet filterable (need to select a field within)
      if (elementType.typeName) return false;
      // Primitive array element is filterable
      return true;
    }
    
    return lastSelection.fieldInfo.isFilterable;
  }, [idl, lastSelection]);

  // Build the current field path
  const fieldPath = useMemo(() => {
    const path: string[] = [];
    for (const sel of selections) {
      path.push(sel.fieldName);
      if (sel.fieldInfo.isArray && sel.arrayIndex !== undefined) {
        path.push(sel.arrayIndex);
      }
    }
    return path;
  }, [selections]);

  // Get the final field type
  const finalFieldType = useMemo((): PrimitiveType | null => {
    if (!isFilterableField || fieldPath.length === 0) return null;
    return getFieldType(idl, accountType, fieldPath);
  }, [idl, accountType, fieldPath, isFilterableField]);

  // Handle field selection
  const handleFieldSelect = (fieldName: string) => {
    const field = currentFields.find(f => f.name === fieldName);
    if (!field) return;

    setSelections([...selections, { fieldName, fieldInfo: field }]);
    setFilterValue("");
    setValidationError(null);
  };

  // Handle array index selection
  const handleArrayIndexSelect = (index: string) => {
    if (!lastSelection) return;
    
    // Update the last selection with the array index
    const updatedSelections = [...selections];
    updatedSelections[updatedSelections.length - 1] = {
      ...lastSelection,
      arrayIndex: index,
    };
    setSelections(updatedSelections);
    setFilterValue("");
    setValidationError(null);
  };

  // Handle going back one level
  const handleBack = () => {
    if (selections.length === 0) return;
    
    const lastSel = selections[selections.length - 1];
    
    // If last selection has an array index, just remove the index
    if (lastSel.arrayIndex !== undefined) {
      const updatedSelections = [...selections];
      updatedSelections[updatedSelections.length - 1] = {
        fieldName: lastSel.fieldName,
        fieldInfo: lastSel.fieldInfo,
        // arrayIndex removed
      };
      setSelections(updatedSelections);
    } else {
      // Remove the last selection entirely
      setSelections(selections.slice(0, -1));
    }
    
    setFilterValue("");
    setValidationError(null);
  };

  // Handle reset
  const handleReset = () => {
    setSelections([]);
    setFilterValue("");
    setValidationError(null);
  };

  // Handle apply filter
  const handleApply = () => {
    if (!isFilterableField || !finalFieldType || !filterValue) return;

    // Validate the value
    if (!validateFilterValue(filterValue, finalFieldType)) {
      setValidationError(`Invalid value for ${finalFieldType}`);
      return;
    }

    const newFilter: AccountFilter = {
      fieldPath,
      fieldLabel: formatFieldPath(fieldPath),
      value: filterValue,
      fieldType: finalFieldType,
    };

    onApplyFilter(newFilter);
    setOpen(false);
  };

  // Get array length for index dropdown
  const arrayLength = useMemo(() => {
    if (!lastSelection || !lastSelection.fieldInfo.isArray) return 0;
    return lastSelection.fieldInfo.arrayLength || 0;
  }, [lastSelection]);

  const hasActiveFilter = filter !== null;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="icon"
          className={cn(
            "relative h-9 w-9 shrink-0",
            hasActiveFilter && "border-primary"
          )}
          disabled={disabled}
        >
          <Filter className="h-4 w-4" />
          {hasActiveFilter && (
            <span className="absolute -top-1 -right-1 h-2.5 w-2.5 rounded-full bg-primary" />
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80" align="end">
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h4 className="font-medium">Filter by Field</h4>
            {hasActiveFilter && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  onClearFilter();
                  handleReset();
                }}
                className="h-7 px-2 text-xs"
              >
                Clear Filter
              </Button>
            )}
          </div>

          {/* Field Path Display */}
          {fieldPath.length > 0 && (
            <div className="flex items-center gap-1 text-sm text-muted-foreground">
              <span className="font-mono text-xs bg-muted px-1.5 py-0.5 rounded">
                {formatFieldPath(fieldPath)}
              </span>
              <Button
                variant="ghost"
                size="icon"
                className="h-5 w-5"
                onClick={handleBack}
              >
                <X className="h-3 w-3" />
              </Button>
            </div>
          )}

          {/* Array Index Selector */}
          {needsArrayIndex && (
            <div className="space-y-2">
              <label className="text-sm font-medium">Select Index</label>
              <Select onValueChange={handleArrayIndexSelect} value={lastSelection?.arrayIndex || ""}>
                <SelectTrigger>
                  <SelectValue placeholder="Select index..." />
                </SelectTrigger>
                <SelectContent>
                  {Array.from({ length: arrayLength }, (_, i) => (
                    <SelectItem key={i} value={String(i)}>
                      [{i}]
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Field Selector */}
          {!needsArrayIndex && !isFilterableField && currentFields.length > 0 && (
            <div className="space-y-2">
              <label className="text-sm font-medium">
                {selections.length === 0 ? "Select Field" : "Select Nested Field"}
              </label>
              <Select onValueChange={handleFieldSelect}>
                <SelectTrigger>
                  <SelectValue placeholder="Choose a field..." />
                </SelectTrigger>
                <SelectContent>
                  {currentFields.map((field) => (
                    <SelectItem key={field.name} value={field.name}>
                      <div className="flex items-center justify-between w-full">
                        <span>{field.name}</span>
                        {!field.isFilterable && (
                          <ChevronRight className="h-3 w-3 ml-2 text-muted-foreground" />
                        )}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Value Input */}
          {isFilterableField && finalFieldType && (
            <div className="space-y-2">
              <label className="text-sm font-medium">
                Value ({finalFieldType})
              </label>
              {finalFieldType === "bool" ? (
                <Select onValueChange={setFilterValue} value={filterValue}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select value..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="true">true</SelectItem>
                    <SelectItem value="false">false</SelectItem>
                  </SelectContent>
                </Select>
              ) : (
                <Input
                  value={filterValue}
                  onChange={(e) => {
                    setFilterValue(e.target.value);
                    setValidationError(null);
                  }}
                  placeholder={getTypePlaceholder(finalFieldType)}
                  className={cn(validationError && "border-destructive")}
                />
              )}
              {validationError && (
                <p className="text-xs text-destructive">{validationError}</p>
              )}
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex justify-between pt-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleReset}
              disabled={selections.length === 0}
            >
              Reset
            </Button>
            <Button
              size="sm"
              onClick={handleApply}
              disabled={!isFilterableField || !filterValue || loading}
            >
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-3 w-3 animate-spin" />
                  Filtering...
                </>
              ) : (
                "Apply Filter"
              )}
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}

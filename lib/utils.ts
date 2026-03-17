import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function sv(val: number | readonly number[]): number {
  return Array.isArray(val) ? val[0] : val as number;
}

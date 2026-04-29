"use client";

interface Props {
  onClick: () => void;
  disabled: boolean;
}

export default function ResetButton({ onClick, disabled }: Props) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="border border-gray-200 text-gray-600 py-3 px-5 rounded-xl text-sm font-semibold hover:bg-gray-50 disabled:hover:bg-transparent transition-colors disabled:opacity-50 disabled:cursor-default cursor-pointer"
    >
      Reset
    </button>
  );
}

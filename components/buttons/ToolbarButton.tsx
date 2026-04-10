import React from 'react';
import { TouchableOpacity, TouchableOpacityProps } from 'react-native';

export default function ToolbarButton({ children, ...props }: TouchableOpacityProps) {
  return (
    <TouchableOpacity
      className="w-[30px] p-[3px] mx-[3px] items-center justify-center bg-white/80 border border-[#666] rounded-[3px]"
      activeOpacity={0.7}
      {...props}
    >
      {children}
    </TouchableOpacity>
  );
}

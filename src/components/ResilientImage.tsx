import { useState } from 'react';
import { Utensils } from 'lucide-react';

interface ResilientImageProps {
  src: string;
  alt: string;
  className?: string;
}

export function ResilientImage({ src, alt, className = 'w-full h-full object-cover' }: ResilientImageProps) {
  const [failed, setFailed] = useState(false);

  if (failed || !src) {
    return (
      <div
        className="w-full h-full bg-gradient-to-br from-[#F4F4F2] to-[#E7E5E4] flex flex-col items-center justify-center p-4 text-center text-[#57534E]"
        role="img"
        aria-label={alt}
      >
        <Utensils className="w-7 h-7 mb-2 text-[#1B4332]/60" />
        <span className="text-xs font-medium line-clamp-2 max-w-[180px]">{alt}</span>
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={alt}
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
      className={className}
    />
  );
}

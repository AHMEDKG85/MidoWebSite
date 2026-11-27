import { useState } from 'react';
import { Glasses } from 'lucide-react';

interface SmartImageProps {
  src: string;
  alt: string;
  className?: string;
}

export function SmartImage({ src, alt, className = '' }: SmartImageProps) {
  const [failed, setFailed] = useState(false);

  if (!src || failed) {
    return (
      <div
        className={`flex flex-col items-center justify-center bg-[#ECEAE3] text-[#6E6B64] p-4 text-center ${className}`}
        role="img"
        aria-label={alt}
      >
        <Glasses className="w-8 h-8 mb-2 opacity-60" strokeWidth={1.5} />
        <span className="text-xs font-medium line-clamp-2">{alt}</span>
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
      loading="lazy"
    />
  );
}

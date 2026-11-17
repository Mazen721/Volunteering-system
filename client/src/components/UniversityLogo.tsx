import mnuLogo from '../assets/mnu-logo.png';
import { AR } from '../constants/ar';

interface UniversityLogoProps {
  className?: string;
}

/**
 * Circular Mansoura National University seal logo.
 */
export function UniversityLogo({ className = 'w-12 h-12' }: UniversityLogoProps) {
  return (
    <img
      src={mnuLogo}
      alt={AR.brand.logoAlt}
      className={`rounded-full object-contain shrink-0 ${className}`}
    />
  );
}

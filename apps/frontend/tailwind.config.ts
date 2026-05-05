import type { Config } from 'tailwindcss';

/**
 * Bold Aggressive Design System
 *
 * High-impact, modern palette:
 * - Pure black backgrounds
 * - Crisp white text
 * - Electric magenta (#ff0080) primary
 * - Neon cyan (#00d9ff) secondary
 * - Maximum contrast and precision
 */

const config: Config = {
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      // ============================================
      // COLOR PALETTE - Bold Aggressive
      // ============================================
      colors: {
        // Background layers - pure black to dark charcoal
        background: {
          DEFAULT: '#000000', // Pure black
          secondary: '#1a1a1a', // Very dark gray
          tertiary: '#2d2d2d', // Dark gray
        },
        // Surface cards - deep black/charcoal
        surface: {
          DEFAULT: '#0a0a0a', // Deep black
          muted: '#000000', // Pure black
          elevated: '#1a1a1a', // Charcoal
          hover: '#2d2d2d', // Hover state
        },
        // Primary accent - electric magenta
        primary: {
          DEFAULT: '#ff0080',
          50: '#ffe6f0',
          100: '#ffcce1',
          200: '#ff99c3',
          300: '#ff66a5',
          400: '#ff3387',
          500: '#ff0080',
          600: '#e60073',
          700: '#cc0066',
          800: '#b30059',
          900: '#99004d',
        },
        // Secondary accent - neon cyan
        secondary: {
          DEFAULT: '#00d9ff',
          50: '#e0f7ff',
          100: '#b3ecff',
          200: '#80e1ff',
          300: '#4dd6ff',
          400: '#1acbff',
          500: '#00d9ff',
          600: '#00b8d4',
          700: '#0097aa',
          800: '#007680',
          900: '#005560',
        },
        // Border colors - cyan and magenta with opacity
        border: {
          DEFAULT: '#333333', // Subtle border on black
          light: '#1a1a1a', // Very subtle
          medium: '#4d4d4d', // Visible border
          focus: '#00d9ff40', // Cyan focus ring
        },
        // Text colors - white and grays
        text: {
          primary: '#ffffff', // Pure white
          secondary: '#e0e0e0', // Light gray
          tertiary: '#a0a0a0', // Medium gray
          muted: '#606060', // Muted gray
          inverse: '#000000', // On light backgrounds
        },
        // Status colors - vibrant and contrasted
        status: {
          success: '#00d964', // Bright green
          'success-bg': '#00d96415',
          warning: '#ffa500', // Bright orange
          'warning-bg': '#ffa50015',
          error: '#ff3b3b', // Bright red
          'error-bg': '#ff3b3b15',
          info: '#00d9ff', // Cyan
          'info-bg': '#00d9ff15',
          idle: '#808080', // Gray
          'idle-bg': '#80808015',
        },
      },
      // ============================================
      // GRADIENTS - Professional brand spectrum
      // ============================================
      backgroundImage: {
        // Full strength accent gradient
        'gradient-brand-accent': 'linear-gradient(135deg, #ff0080 0%, #00d9ff 100%)',
        // Semi-transparent accent for overlays
        'gradient-brand-accent-dark':
          'linear-gradient(135deg, rgba(255, 0, 128, 0.2) 0%, rgba(0, 217, 255, 0.2) 100%)',
        // Subtle background for cards - very light magenta to cyan
        'gradient-brand-subtle':
          'linear-gradient(135deg, rgba(255, 0, 128, 0.08) 0%, rgba(0, 217, 255, 0.08) 100%)',
        // Card surface - sophisticated dark with brand accent
        'gradient-card': 'linear-gradient(135deg, rgba(0, 0, 0, 0.4) 0%, rgba(0, 217, 255, 0.05) 100%)',
        // Hover state - brighter version
        'gradient-card-hover': 'linear-gradient(135deg, rgba(0, 0, 0, 0.3) 0%, rgba(0, 217, 255, 0.08) 100%)',
        // Icon background - subtle magenta tint
        'gradient-icon-bg': 'linear-gradient(135deg, rgba(255, 0, 128, 0.1) 0%, rgba(255, 0, 128, 0.05) 100%)',
        // Focus/Active state - stronger brand presence
        'gradient-focus': 'linear-gradient(135deg, rgba(255, 0, 128, 0.15) 0%, rgba(0, 217, 255, 0.15) 100%)',
      },
      // ============================================
      // TYPOGRAPHY - Bold Modern: Syne + Space Mono
      // ============================================
      fontFamily: {
        sans: ['var(--font-sans)', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'sans-serif'],
        serif: ['Georgia', 'Cambria', 'Times New Roman', 'serif'],
        mono: ['var(--font-mono)', 'SF Mono', 'Consolas', 'Liberation Mono', 'monospace'],
      },
      fontSize: {
        // Display sizes
        display: ['2.25rem', { lineHeight: '1.2', letterSpacing: '-0.025em', fontWeight: '600' }],
        'display-sm': [
          '1.875rem',
          { lineHeight: '1.25', letterSpacing: '-0.02em', fontWeight: '600' },
        ],
        // Headings
        heading: ['1.5rem', { lineHeight: '1.35', letterSpacing: '-0.015em', fontWeight: '600' }],
        'heading-sm': [
          '1.25rem',
          { lineHeight: '1.4', letterSpacing: '-0.01em', fontWeight: '600' },
        ],
        'heading-md': [
          '1.375rem',
          { lineHeight: '1.35', letterSpacing: '-0.012em', fontWeight: '600' },
        ],
        // Body text
        'body-lg': ['1.0625rem', { lineHeight: '1.65' }],
        body: ['0.9375rem', { lineHeight: '1.6' }],
        'body-sm': ['0.875rem', { lineHeight: '1.55' }],
        // Small text
        caption: ['0.8125rem', { lineHeight: '1.5' }],
        micro: ['0.75rem', { lineHeight: '1.4' }],
        // Labels
        label: ['0.8125rem', { lineHeight: '1.4', letterSpacing: '0.01em', fontWeight: '500' }],
      },
      // ============================================
      // SPACING - Generous whitespace
      // ============================================
      spacing: {
        '4.5': '1.125rem',
        '5.5': '1.375rem',
        '13': '3.25rem',
        '15': '3.75rem',
        '18': '4.5rem',
        '22': '5.5rem',
      },
      // ============================================
      // BORDER RADIUS - Soft, friendly
      // ============================================
      borderRadius: {
        sm: '0.375rem',
        DEFAULT: '0.5rem',
        md: '0.625rem',
        lg: '0.75rem',
        xl: '1rem',
        '2xl': '1.25rem',
      },
      // ============================================
      // SHADOWS - Subtle elevation
      // ============================================
      boxShadow: {
        xs: '0 1px 2px rgba(45, 42, 38, 0.04)',
        sm: '0 1px 3px rgba(45, 42, 38, 0.06), 0 1px 2px rgba(45, 42, 38, 0.04)',
        DEFAULT: '0 2px 8px rgba(45, 42, 38, 0.06), 0 1px 3px rgba(45, 42, 38, 0.04)',
        md: '0 4px 12px rgba(45, 42, 38, 0.07), 0 2px 4px rgba(45, 42, 38, 0.04)',
        lg: '0 8px 24px rgba(45, 42, 38, 0.08), 0 4px 8px rgba(45, 42, 38, 0.04)',
        card: '0 1px 3px rgba(45, 42, 38, 0.04), 0 4px 12px rgba(45, 42, 38, 0.03)',
        'card-hover': '0 2px 6px rgba(45, 42, 38, 0.06), 0 8px 24px rgba(45, 42, 38, 0.06)',
        inner: 'inset 0 1px 2px rgba(45, 42, 38, 0.06)',
      },
      // ============================================
      // TRANSITIONS - Premium, intentional motion
      // ============================================
      transitionDuration: {
        '250': '250ms',
        '350': '350ms',
        '400': '400ms',
      },
      transitionTimingFunction: {
        'ease-out-expo': 'cubic-bezier(0.16, 1, 0.3, 1)',
        'ease-in-out-expo': 'cubic-bezier(0.87, 0, 0.13, 1)',
      },
      // ============================================
      // ANIMATIONS - Subtle, intentional
      // ============================================
      animation: {
        'fade-in': 'fadeIn 400ms cubic-bezier(0.16, 1, 0.3, 1)',
        'slide-up': 'slideUp 400ms cubic-bezier(0.16, 1, 0.3, 1)',
        'slide-down': 'slideDown 300ms cubic-bezier(0.16, 1, 0.3, 1)',
        'scale-in': 'scaleIn 300ms cubic-bezier(0.16, 1, 0.3, 1)',
        'pulse-subtle': 'pulseSubtle 2.5s ease-in-out infinite',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideUp: {
          '0%': { opacity: '0', transform: 'translateY(8px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        slideDown: {
          '0%': { opacity: '0', transform: 'translateY(-8px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        scaleIn: {
          '0%': { opacity: '0', transform: 'scale(0.96)' },
          '100%': { opacity: '1', transform: 'scale(1)' },
        },
        pulseSubtle: {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.6' },
        },
      },
      // ============================================
      // MAX-WIDTH - Content containment
      // ============================================
      maxWidth: {
        prose: '65ch',
        content: '72rem',
      },
    },
  },
  plugins: [],
};

export default config;

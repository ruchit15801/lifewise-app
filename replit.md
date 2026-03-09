# SpendIQ - AI Life Assistant / Smart Expense Intelligence App

## Overview
A premium luxury fintech-style mobile app that acts as an intelligent life companion for managing spending, bills, and financial health. Features smart spending analysis, money leak detection, payment reminders, and a spending health score. Inspired by CRED, Apple Health, Jupiter Money, and Headspace.

## Tech Stack
- **Frontend**: Expo (React Native) with Expo Router for file-based routing
- **Backend**: Express.js (Node.js/TypeScript) with PostgreSQL
- **Auth**: bcryptjs password hashing, AsyncStorage token persistence
- **State Management**: React Context (Auth, Theme, Expenses) + AsyncStorage
- **UI Framework**: React Native StyleSheet with Inter font family
- **Animations**: react-native-reanimated for entrance animations

## Project Structure
```
app/
  _layout.tsx          # Root layout with ThemeProvider, AuthProvider, ExpenseProvider, AuthGate routing
  onboarding.tsx       # 3-slide swipeable onboarding (purple/blue/orange accents)
  settings.tsx         # Settings screen (dark mode toggle, profile, logout)
  (auth)/
    _layout.tsx        # Auth stack layout
    login.tsx          # Email/password login + social buttons (purple gradient)
    register.tsx       # Registration with name/email/password
  (tabs)/
    _layout.tsx        # Tab navigation (5 tabs with liquid glass support)
    index.tsx          # Home Dashboard with spending score ring
    transactions.tsx   # Transaction Timeline with premium cards
    reports.tsx        # Monthly Report with data visualizations
    leaks.tsx          # Money Leak Detector with savings insights
    bills.tsx          # Smart Payment Reminder System
lib/
  data.ts              # Types, mock data generators, utility functions
  expense-context.tsx  # React Context for expense state management
  auth-context.tsx     # Auth context (login/register/logout, onboarding state)
  theme-context.tsx    # Theme context (light/dark mode, AsyncStorage persisted)
  query-client.ts      # React Query client config, getApiUrl(), apiRequest()
constants/
  colors.ts            # Premium fintech color palette (ThemeColors interface)
components/
  ErrorBoundary.tsx    # Error boundary component
  ErrorFallback.tsx    # Error fallback UI
server/
  index.ts             # Express server entry
  routes.ts            # API routes (auth/register, auth/login)
```

## Design System
### Color Palette
- **Primary Accent**: Electric Purple (#8B5CF6 dark / #7C3AED light)
- **Secondary Accents**: Neon Blue (#3B82F6), Soft Mint (#10B981), Warm Orange (#F59E0B)
- **Dark Mode**: Midnight blue gradient (#0F172A → #1E293B), cards #1E293B
- **Light Mode**: Soft gradient (#F8FAFC → #EEF2FF), white cards
- **Semantic**: Danger #EF4444, Warning #F59E0B
- **Hero gradients**: Purple-tinted gradient surfaces for key cards

### Typography
- Inter font family (Regular 400, Medium 500, SemiBold 600, Bold 700)
- Title: 28-32px, Cards: 18-22px, Body: 14-16px
- Numbers feel bold and premium with negative letter-spacing

### Layout Principles
- Luxury minimalism: large cards, generous whitespace, soft borders
- Card borderRadius: 18-24px with 1px subtle borders
- Calm, intelligent feel — no clutter

## Auth Flow
1. **Splash** - Midnight blue gradient with purple SpendIQ logo (1.2s)
2. **Onboarding** - 3 slides (Smart Insights, Money Leaks, Payment Reminders)
3. **Login/Register** - Email/password with purple gradient buttons
4. **Main Tabs** - 5-tab premium dashboard

## Key Features
1. **Home Dashboard** - Greeting, spending score ring, hero spending card, life insights, category pills, recent transactions
2. **Transaction Timeline** - Premium grouped cards with category filters, summary stats
3. **Monthly Reports** - Month selector, gradient summary card, category bars, top merchants, savings rate
4. **Money Leak Detector** - Leak cards with savings potential, gradient savings summary, AI-friendly suggestions
5. **Smart Payment Reminders** - Bill/subscription/custom types, CRUD, snooze, filter tabs, overview card
6. **Light/Dark Mode** - Toggle in Settings, persisted via AsyncStorage, default: light
7. **Spending Health Score** - Computed from budget usage, bills paid, leak amounts

## Data Model
- **Users table** (PostgreSQL): id, email, password_hash, name, created_at
- Storage keys: `@spendiq_user`, `@spendiq_token`, `@spendiq_onboarded`, `@spendiq_theme`
- Bills use `_v2` storage key suffix

## Environment
- Frontend: Port 8081 (Expo web)
- Backend: Port 5000 (Express API)
- Database: PostgreSQL via DATABASE_URL
- Auth endpoints: POST /api/auth/register, POST /api/auth/login

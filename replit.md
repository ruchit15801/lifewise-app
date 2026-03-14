# LifeWise - AI Life Assistant / Smart Expense Intelligence App

## Overview
A premium luxury fintech-style mobile app that acts as an intelligent life companion for managing spending, bills, and financial health. Features smart spending analysis, money leak detection, payment reminders, spending health score, family hub with medicine reminders, decision assistant, life memory insights, and senior mode.

## Tech Stack
- **Frontend**: Expo (React Native) with Expo Router for file-based routing
- **Backend**: Express.js (Node.js/TypeScript) with PostgreSQL
- **Auth**: bcryptjs password hashing, AsyncStorage token persistence
- **State Management**: React Context (Auth, Theme, Expenses, Currency) + AsyncStorage
- **UI Framework**: React Native StyleSheet with Inter font family
- **Animations**: react-native-reanimated for entrance animations

## Project Structure
```
app/
  _layout.tsx          # Root layout with ThemeProvider, CurrencyProvider, AuthProvider, ExpenseProvider, AuthGate routing
  onboarding.tsx       # 3-slide swipeable onboarding (purple/blue/orange accents)
  settings.tsx         # Settings screen (dark mode, currency picker, senior mode, logout)
  life-memory.tsx      # Life Memory - AI pattern insights from spending data
  family.tsx           # Family Hub - family members + medicine reminders (Taken/Snooze/Skip)
  assistant.tsx        # Decision Assistant - chat UI with financial insights
  (auth)/
    _layout.tsx        # Auth stack layout
    login.tsx          # Email/password login + social buttons (purple gradient)
    register.tsx       # Registration with name/email/password
  (tabs)/
    _layout.tsx        # Tab navigation (5 tabs with liquid glass support)
    index.tsx          # Home Dashboard with spending score ring, action buttons, quick access, senior mode
    transactions.tsx   # Transaction Timeline with premium cards
    reports.tsx        # Monthly Report with data visualizations
    leaks.tsx          # Money Leak Detector with savings insights
    bills.tsx          # Smart Payment Reminder System
lib/
  data.ts              # Types, mock data generators, utility functions
  expense-context.tsx  # React Context for expense state management
  auth-context.tsx     # Auth context (login/register/logout, onboarding state)
  theme-context.tsx    # Theme context (light/dark mode, AsyncStorage persisted)
  currency-context.tsx # Currency context (symbol/code, AsyncStorage persisted, default INR ₹)
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
1. **Splash** - Midnight blue gradient with purple LifeWise logo (1.2s)
2. **Onboarding** - 3 slides (Smart Insights, Money Leaks, Payment Reminders)
3. **Login/Register** - Email/password with purple gradient buttons
4. **Main Tabs** - 5-tab premium dashboard

## Key Features
1. **Home Dashboard** - Greeting, spending score ring (tappable for detail), hero spending card, today's reminders, life insights, quick access cards (Family Hub, Life Memory, Assistant), category pills, recent transactions, action buttons (Quick Add, Scan Bill, Auto Track)
2. **Transaction Timeline** - Premium grouped cards with category filters, summary stats, currency symbols
3. **Monthly Reports** - Month selector, gradient summary card, category bars, top merchants, savings rate
4. **Money Leak Detector** - Leak cards with savings potential, gradient savings summary, AI-friendly suggestions
5. **Smart Payment Reminders** - Bill/subscription/custom types, CRUD, snooze, filter tabs, overview card
6. **Light/Dark Mode** - Toggle in Settings, persisted via AsyncStorage, default: light
7. **Spending Health Score** - Computed from budget usage, bills paid, leak amounts; tappable detail card with share button
8. **Currency System** - Configurable currency (INR ₹, USD $, EUR €, GBP £, JPY ¥, AUD A$, CAD C$), persisted in AsyncStorage, all amounts show selected symbol
9. **Family Hub** - Add family members (Self, Papa, Mummy, Partner, Child, Other), medicine reminders per member with Taken/Snooze/Skip actions, stored in AsyncStorage
10. **Life Memory** - AI-generated insights from transaction data (spending patterns by day, top categories, favorite merchants, food ordering patterns, monthly trends, bill insights, savings opportunities)
11. **Decision Assistant** - Chat-like UI with pre-built financial analysis (affordability check, food spending, savings status, spending trends, top merchants, budget check), quick suggestion chips
12. **Senior Mode** - Toggle in Settings, simplified home with 4 large buttons (Money, Health, Family, Reminders), larger fonts

## Data Model
- **Users table** (PostgreSQL): id, email, password_hash, name, created_at
- Storage keys: `@lifewise_user`, `@lifewise_token`, `@lifewise_onboarded`, `@lifewise_theme`, `@lifewise_currency`, `@lifewise_family`, `@lifewise_senior_mode`
- Bills use `_v2` storage key suffix

## Environment
- Frontend: Port 8081 (Expo web)
- Backend: Port 5000 (Express API)
- Database: PostgreSQL via DATABASE_URL
- Auth endpoints: POST /api/auth/register, POST /api/auth/login

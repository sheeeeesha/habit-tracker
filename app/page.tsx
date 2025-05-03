"use client";

import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell
} from 'recharts';
import { format, addDays, startOfWeek, eachDayOfInterval, isSameDay } from 'date-fns';
import Image from 'next/image';

// Add these type definitions above the HabitTracker component

// Define types for our data models
type User = {
  id: string;
  name: string;
  email: string;
  avatar: string;
  joinedDate: Date;
};

type Habit = {
  id: string;
  userId: string;
  title: string;
  description: string;
  category: string;
  targetDays: number[];  // 0 = Sunday, 1 = Monday, etc.
  targetValue: number;   // Target value (e.g., 10 pages, 5 miles)
  unit: string;          // Unit of measurement (e.g., pages, miles)
  color: string;         // For visualization
  createdAt: Date;
  streak: number;        // Current streak
  longestStreak: number; // Longest streak achieved
};

type HabitLog = {
  id: string;
  habitId: string;
  date: Date;
  value: number;         // Actual value achieved
  completed: boolean;    // Whether the target was met
  note?: string;         // Optional note
};

// Add this mock data below the type definitions

// Generate mock data
const generateMockData = () => {
  // Current user
  const user: User = {
    id: '1',
    name: 'Alexa Johnson',
    email: 'alexa@example.com',
    avatar: 'https://randomuser.me/api/portraits/women/44.jpg',
    joinedDate: new Date(2024, 2, 15), // March 15, 2024
  };

  // Mock habits
  const habits: Habit[] = [
    {
      id: '1',
      userId: '1',
      title: 'Read Books',
      description: 'Read at least 20 pages daily',
      category: 'Learning',
      targetDays: [0, 1, 2, 3, 4, 5, 6], // Every day
      targetValue: 20,
      unit: 'pages',
      color: '#4C51BF', // Indigo
      createdAt: new Date(2024, 3, 1), // April 1, 2024
      streak: 12,
      longestStreak: 15,
    },
    {
      id: '2',
      userId: '1',
      title: 'Exercise',
      description: 'Go for a run or workout',
      category: 'Health',
      targetDays: [1, 3, 5], // Monday, Wednesday, Friday
      targetValue: 30,
      unit: 'minutes',
      color: '#F56565', // Red
      createdAt: new Date(2024, 3, 5), // April 5, 2024
      streak: 4,
      longestStreak: 8,
    },
    {
      id: '3',
      userId: '1',
      title: 'Meditate',
      description: 'Morning meditation session',
      category: 'Mindfulness',
      targetDays: [0, 1, 2, 3, 4, 5, 6], // Every day
      targetValue: 10,
      unit: 'minutes',
      color: '#68D391', // Green
      createdAt: new Date(2024, 3, 10), // April 10, 2024
      streak: 7,
      longestStreak: 7,
    },
    {
      id: '4',
      userId: '1',
      title: 'Code Practice',
      description: 'Work on coding projects',
      category: 'Learning',
      targetDays: [1, 2, 3, 4, 5], // Weekdays
      targetValue: 60,
      unit: 'minutes',
      color: '#4299E1', // Blue
      createdAt: new Date(2024, 3, 15), // April 15, 2024
      streak: 5,
      longestStreak: 10,
    },
  ];

  // Generate habit logs for the past 14 days
  const today = new Date();
  const habitLogs: HabitLog[] = [];

  habits.forEach(habit => {
    // For each habit, create logs for the past 14 days
    for (let i = 0; i < 14; i++) {
      const logDate = addDays(today, -i);
      const dayOfWeek = logDate.getDay();

      // Only create logs for target days of the habit
      if (habit.targetDays.includes(dayOfWeek)) {
        // Randomize completion with a bias towards completion (70% chance)
        const randomCompletion = Math.random() > 0.3;
        const randomValue = randomCompletion
          ? habit.targetValue + Math.floor(Math.random() * 10)
          : Math.floor(Math.random() * habit.targetValue);

        habitLogs.push({
          id: `log-${habit.id}-${i}`,
          habitId: habit.id,
          date: logDate,
          value: randomValue,
          completed: randomValue >= habit.targetValue,
          note: randomCompletion ? undefined : 'Missed this day',
        });
      }
    }
  });

  return { user, habits, habitLogs };
};

// Add motivational quotes collection
const motivationalQuotes = [
  "The only way to do great work is to love what you do. - Steve Jobs",
  "Success is not final, failure is not fatal: it is the courage to continue that counts. - Winston Churchill",
  "Believe you can and you're halfway there. - Theodore Roosevelt",
  "The future belongs to those who believe in the beauty of their dreams. - Eleanor Roosevelt",
  "Don't watch the clock; do what it does. Keep going. - Sam Levenson",
  "The only limit to our realization of tomorrow is our doubts of today. - Franklin D. Roosevelt",
  "It does not matter how slowly you go as long as you do not stop. - Confucius",
  "Success is walking from failure to failure with no loss of enthusiasm. - Winston Churchill",
  "The way to get started is to quit talking and begin doing. - Walt Disney",
  "You are never too old to set another goal or to dream a new dream. - C.S. Lewis"
];

// Function to get a random quote
const getRandomQuote = () => {
  return motivationalQuotes[Math.floor(Math.random() * motivationalQuotes.length)];
};

// Function to get greeting based on time of day
const getGreeting = () => {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
};

// Update the HabitTracker component with this code

export default function HabitTracker() {
  // State management
  const [activeView, setActiveView] = useState<'landing' | 'dashboard' | 'habits' | 'stats' | 'habitDetail'>('landing');
  const [mockData, setMockData] = useState(() => generateMockData());
  const [selectedHabit, setSelectedHabit] = useState<Habit | null>(null);
  const [detailedHabit, setDetailedHabit] = useState<Habit | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [showAddHabit, setShowAddHabit] = useState(false);
  const [addHabitError, setAddHabitError] = useState('');

  // Navigation handler
  const navigate = (view: 'landing' | 'dashboard' | 'habits' | 'stats' | 'habitDetail') => {
    setActiveView(view);
    if (view !== 'landing') {
      setIsAuthenticated(true);
    }
  };

  // Handler for habit check-in
  const checkInHabit = (habitId: string, value: number) => {
    setMockData(prevData => {
      const today = new Date();
      const todayStr = today.toDateString();
      const habit = prevData.habits.find((h: Habit) => h.id === habitId);
      if (!habit) return prevData;

      // Find if a log for this habit and today already exists
      let logFound = false;
      const updatedLogs = prevData.habitLogs.map((log: HabitLog) => {
        if (
          log.habitId === habitId &&
          new Date(log.date).toDateString() === todayStr
        ) {
          logFound = true;
          return {
            ...log,
            value,
            completed: value >= habit.targetValue,
            note: value >= habit.targetValue ? undefined : 'Missed this day',
          };
        }
        return log;
      });

      // If not found, add a new log
      if (!logFound) {
        updatedLogs.push({
          id: `log-${habitId}-${todayStr}`,
          habitId,
          date: today,
          value,
          completed: value >= habit.targetValue,
          note: value >= habit.targetValue ? undefined : 'Missed this day',
        });
      }

      return {
        ...prevData,
        habitLogs: updatedLogs,
      };
    });
  };

  const addHabit = (habit: Omit<Habit, 'id' | 'userId' | 'createdAt' | 'streak' | 'longestStreak'>) => {
    setMockData(prevData => {
      // Generate a new numeric string ID based on the max existing ID + 1
      const maxId = prevData.habits.reduce((max, h) => Math.max(max, Number(h.id)), 0);
      const newHabit: Habit = {
        ...habit,
        id: (maxId + 1).toString(),
        userId: prevData.user.id,
        createdAt: new Date(),
        streak: 0,
        longestStreak: 0,
      };
      return {
        ...prevData,
        habits: [...prevData.habits, newHabit],
      };
    });
  };

  return (
    <div className="min-h-screen bg-gradient-to-t from-gray-300 via-gray-500 to-black">
      {/* Navbar */}
      <nav className="bg-transparent shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16">
            <div className="flex">
              <div className="flex-shrink-0 flex items-center">
                <motion.div
                  whileHover={{ scale: 1.05 }}
                  className="cursor-pointer"
                  onClick={() => navigate('landing')}
                >
                  <span className="text-2xl font-bold text-white">HabitTrack</span>
                </motion.div>
              </div>
              {isAuthenticated && (
                <div className="hidden sm:ml-6 sm:flex sm:space-x-8">
                  <button
                    onClick={() => navigate('dashboard')}
                    className={`${activeView === 'dashboard'
                      ? 'border-indigo-500 text-white'
                      : 'border-transparent text-white hover:border-gray-300 hover:text-gray-400'
                      } inline-flex items-center px-1 pt-1 border-b-2 text-sm font-medium`}
                  >
                    Dashboard
                  </button>
                  <button
                    onClick={() => navigate('habits')}
                    className={`${activeView === 'habits'
                      ? 'border-indigo-500 text-white'
                      : 'border-transparent text-white hover:border-gray-300 hover:text-gray-400'
                      } inline-flex items-center px-1 pt-1 border-b-2 text-sm font-medium`}
                  >
                    My Habits
                  </button>
                  <button
                    onClick={() => navigate('stats')}
                    className={`${activeView === 'stats'
                      ? 'border-indigo-500 text-white'
                      : 'border-transparent text-white hover:border-gray-300 hover:text-gray-400'
                      } inline-flex items-center px-1 pt-1 border-b-2 text-sm font-medium`}
                  >
                    Statistics
                  </button>
                </div>
              )}
            </div>
            <div className="flex items-center">
              {isAuthenticated ? (
                <div className="flex items-center space-x-3">
                  <span className="text-sm text-white">{mockData.user.name}</span>
                  <Image
                    className="h-8 w-8 rounded-full"
                    src={mockData.user.avatar}
                    alt="User avatar"
                    width={32}
                    height={32}
                  />
                </div>
              ) : (
                <button
                  onClick={() => navigate('dashboard')}
                  className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-black bg-white hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-white"
                >
                  Sign In
                </button>
              )}
            </div>
          </div>
        </div>
      </nav>

      {/* Main content */}
      <main className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
        <AnimatePresence mode="wait">
          {activeView === 'landing' && <LandingPage onGetStarted={() => navigate('dashboard')} />}
          {activeView === 'dashboard' && (
            <Dashboard
              mockData={mockData}
              setSelectedHabit={setSelectedHabit}
              navigate={navigate}
              checkInHabit={checkInHabit}
              selectedHabit={selectedHabit}
              setDetailedHabit={setDetailedHabit}
              setShowAddHabit={setShowAddHabit}
              setIsAuthenticated={setIsAuthenticated}
            />
          )}
          {activeView === 'habits' && (
            <HabitsPage
              mockData={mockData}
              setDetailedHabit={setDetailedHabit}
              navigate={navigate}
              showAddHabit={showAddHabit}
              setShowAddHabit={setShowAddHabit}
              addHabit={addHabit}
              addHabitError={addHabitError}
              setAddHabitError={setAddHabitError}
              setMockData={setMockData}
            />
          )}
          {activeView === 'stats' && <StatsPage mockData={mockData} />}
          {activeView === 'habitDetail' && detailedHabit && (
            <HabitDetailPage habit={detailedHabit} habitLogs={mockData.habitLogs} onBack={() => navigate('dashboard')} />
          )}
        </AnimatePresence>
      </main>

      {/* Footer */}
      <footer className="bg-transparent border-t border-gray-200 mt-12 ">
        <div className="max-w-7xl mx-auto py-10 px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
            {/* About */}
            <div>
              <h3 className="text-lg font-bold bg-black
bg-clip-text text-transparent
 mb-4">ABOUT</h3>
              <ul className="space-y-2 text-gray-700">
                <li><a href="#" className="hover:underline">What is HabitTrack?</a></li>
                <li><a href="#" className="hover:underline">How it Works</a></li>
                <li><a href="#" className="hover:underline">Our Mission</a></li>
                <li><a href="#" className="hover:underline">Team</a></li>
              </ul>
            </div>
            {/* Features */}
            <div>
              <h3 className="text-lg font-bold bg-black
bg-clip-text text-transparent
 mb-4">FEATURES</h3>
              <ul className="space-y-2 text-gray-700">
                <li><a href="#" className="hover:underline">Habit Analytics</a></li>
                <li><a href="#" className="hover:underline">Streak Tracker</a></li>
                <li><a href="#" className="hover:underline">Daily Check-ins</a></li>
                <li><a href="#" className="hover:underline">Progress Graphs</a></li>
              </ul>
            </div>
            {/* Resources */}
            <div>
              <h3 className="text-lg font-bold bg-black
bg-clip-text text-transparent
 mb-4">RESOURCES</h3>
              <ul className="space-y-2 text-gray-700">
                <li><a href="#" className="hover:underline">Blog</a></li>
                <li><a href="#" className="hover:underline">Help Center</a></li>
                <li><a href="#" className="hover:underline">Contact Support</a></li>
                <li><a href="#" className="hover:underline">Privacy Policy</a></li>
              </ul>
            </div>
            {/* Contact & Social */}
            <div>
              <h3 className="text-lg font-bold bg-black
bg-clip-text text-transparent
 mb-4">CONNECT</h3>
              <div className="flex items-center space-x-2 text-gray-700 mb-2">
                <svg className="h-5 w-5 bg-gradient-to-r from-gray-800 via-blue-700 to-gray-900
bg-clip-text text-transparent
" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M16 12a4 4 0 01-8 0m8 0V8a4 4 0 10-8 0v4m8 0v4a4 4 0 01-8 0v-4" /></svg>
                <span>support@habittrack.com</span>
              </div>
              <div className="flex items-center space-x-2 text-gray-700 mb-4">
                <svg className="h-5 w-5 bg-gradient-to-r from-gray-800 via-blue-700 to-gray-900
bg-clip-text text-transparent
" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8m-9 4v8" /></svg>
                <span>+1 800 123 4567</span>
              </div>
              <div className="flex space-x-4 mt-4">
                <a href="#" className="text-gray-400 hover:text-black" aria-label="Twitter">
                  <svg className="h-6 w-6" fill="currentColor" viewBox="0 0 24 24"><path d="M8.29 20.251c7.547 0 11.675-6.253 11.675-11.675 0-.178 0-.355-.012-.53A8.348 8.348 0 0022 5.92a8.19 8.19 0 01-2.357.646 4.118 4.118 0 001.804-2.27 8.224 8.224 0 01-2.605.996 4.107 4.107 0 00-6.993 3.743 11.65 11.65 0 01-8.457-4.287 4.106 4.106 0 001.27 5.477A4.072 4.072 0 012.8 9.713v.052a4.105 4.105 0 003.292 4.022 4.095 4.095 0 01-1.853.07 4.108 4.108 0 003.834 2.85A8.233 8.233 0 012 18.407a11.616 11.616 0 006.29 1.84" /></svg>
                </a>
                <a href="#" className="text-gray-400 hover:text-black" aria-label="GitHub">
                  <svg className="h-6 w-6" fill="currentColor" viewBox="0 0 24 24"><path fillRule="evenodd" d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" clipRule="evenodd" /></svg>
                </a>
                <a href="#" className="text-gray-400 hover:text-black" aria-label="Instagram">
                  <svg className="h-6 w-6" fill="currentColor" viewBox="0 0 24 24"><path d="M7.75 2h8.5A5.75 5.75 0 0122 7.75v8.5A5.75 5.75 0 0116.25 22h-8.5A5.75 5.75 0 012 16.25v-8.5A5.75 5.75 0 017.75 2zm0 1.5A4.25 4.25 0 003.5 7.75v8.5A4.25 4.25 0 007.75 20.5h8.5a4.25 4.25 0 004.25-4.25v-8.5A4.25 4.25 0 0016.25 3.5h-8.5zm4.25 3.25a5.25 5.25 0 110 10.5 5.25 5.25 0 010-10.5zm0 1.5a3.75 3.75 0 100 7.5 3.75 3.75 0 000-7.5zm5.5 1.25a1 1 0 110 2 1 1 0 010-2z" /></svg>
                </a>
              </div>
            </div>
          </div>
          <div className="mt-10 text-center text-gray-400 text-sm">
            &copy; 2025 HabitTrack. All rights reserved.
          </div>
        </div>
      </footer>
    </div>
  );
}

// Landing Page Component
const testimonials = [
  {
    text: "This app has completely transformed my morning routine. I've been able to maintain my meditation streak for over 30 days!",
    name: "Sarah Johnson",
    role: "Marketing Manager",
    avatar: "https://randomuser.me/api/portraits/women/32.jpg",
  },
  {
    text: "The analytics help me understand my patterns and make adjustments to my habits. I'm reading more books than ever!",
    name: "Michael Chen",
    role: "Software Engineer",
    avatar: "https://randomuser.me/api/portraits/men/46.jpg",
  },
  {
    text: "I've tried many habit tracking apps, but this one stands out with its beautiful design and intuitive interface.",
    name: "Emma Rodriguez",
    role: "Fitness Instructor",
    avatar: "https://randomuser.me/api/portraits/women/68.jpg",
  },
  {
    text: "HabitTrack keeps me motivated and accountable. My productivity has skyrocketed!",
    name: "David Lee",
    role: "Entrepreneur",
    avatar: "https://randomuser.me/api/portraits/men/22.jpg",
  },
  {
    text: "The streak tracker is a game changer. I love seeing my progress every day!",
    name: "Priya Patel",
    role: "Student",
    avatar: "https://randomuser.me/api/portraits/women/12.jpg",
  },
];

const LandingPage: React.FC<{ onGetStarted: () => void }> = ({ onGetStarted }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [videoScale, setVideoScale] = useState(1);
  const [isHovered, setIsHovered] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleScroll = () => {
      const scrollY = window.scrollY;
      const scale = Math.min(1.3, Math.max(1, 1 + scrollY / 1000));
      setVideoScale(scale);
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className=""
    >
      {/* Hero Section Content */}
      <div className="relative z-20">
        <div className="w-full m-0 p-0">
          <div className="flex flex-col items-center justify-center relative py-12 overflow-hidden">
            <video
              ref={videoRef}
              className="absolute inset-0 w-full h-full object-cover z-0 rounded-4xl"
              style={{ 
                borderRadius: '2rem',
                transform: `scale(${videoScale})`,
                transition: 'transform 0.2s linear'
              }}
              src="/videos/landing-bg.mp4"
              autoPlay
              loop
              muted
              playsInline
            />
            <div className="lg:text-center relative z-20">
              <h1 className="mt-2 text-5xl leading-8 font-extrabold tracking-tight text-black sm:text-4xl font-lexend">
                Take Control of Your Habits
              </h1>
              <p className="mt-4 max-w-2xl text-xl text-white lg:mx-auto font-rubik">
                Track, analyze, and improve your daily habits with our powerful analytics dashboard.
              </p>
              <div className="mt-8 flex justify-center">
                <motion.button
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={onGetStarted}
                  className="px-6 py-3 border border-transparent text-base font-medium rounded-md text-white bg-black hover:to-gray-900 md:py-4 md:text-lg md:px-10"
                >
                  Get Started
                </motion.button>
              </div>
            </div>
            {/* Feature Section */}
            <div className="mt-16 px-10">
              <div className="space-y-10 md:space-y-0 md:grid md:grid-cols-3 md:gap-x-8 md:gap-y-10">
                {/* Feature 1 */}
                <div className="relative">
                  <div className="absolute flex items-center justify-center h-12 w-12 rounded-md bg-black
 text-white">
                    <svg className="h-6 w-6" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                    </svg>
                  </div>
                  <div className="ml-16">
                    <h2 className="text-lg leading-6 font-medium text-black">Habit Progress Graphs</h2>
                    <p className="mt-2 text-base text-white">
                      Visualize your progress over time with beautiful, interactive charts and graphs.
                    </p>
                  </div>
                </div>

                {/* Feature 2 */}
                <div className="relative">
                  <div className="absolute flex items-center justify-center h-12 w-12 rounded-md bg-black
 text-white">
                    <svg className="h-6 w-6" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </div>
                  <div className="ml-16">
                    <h2 className="text-lg leading-6 font-medium text-black">Daily Check-ins</h2>
                    <p className="mt-2 text-base text-white">
                      Set and achieve daily goals with our easy-to-use check-in system.
                    </p>
                  </div>
                </div>

                {/* Feature 3 */}
                <div className="relative">
                  <div className="absolute flex items-center justify-center h-12 w-12 rounded-md bg-black
 text-white">
                    <svg className="h-6 w-6" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                    </svg>
                  </div>
                  <div className="ml-16">
                    <h2 className="text-lg leading-6 font-medium text-black">Streak Tracking</h2>
                    <p className="mt-2 text-base text-white">
                      Build momentum with streak tracking and never break the chain.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
      {/* Images Showcase Section */}
      <div className="w-full mx-auto mt-16 mb-16 px-4 flex flex-col gap-12">
        {/* Image 1 */}
        <AnimatedShowcaseImage1 />
        {/* Image 2 */}
        <AnimatedShowcaseImage2 />
        {/* Image 3 */}
        <AnimatedShowcaseImage3 />
        {/* Image 4 */}
        <AnimatedShowcaseImage4 />
      </div>
      {/* Testimonials Carousel - moved just above the footer */}
      <div className="flex flex-col items-center bg-transparent pt-8 pb-12 rounded-lg w-full max-w-5xl mx-auto relative mt-16 overflow-hidden">
        <h2 className="text-5xl font-bold text-gray-900 mb-8">What Our Users Say</h2>
        <div 
          ref={containerRef}
          className="flex items-center justify-between w-full px-4"
          onMouseEnter={() => setIsHovered(true)}
          onMouseLeave={() => setIsHovered(false)}
        >
          <div className="flex-1 flex flex-row items-center justify-center gap-6 flex-nowrap max-w-full overflow-hidden">
            <motion.div
              className="flex flex-row gap-6"
              animate={{
                x: isHovered ? 0 : [0, -1000],
              }}
              transition={{
                x: {
                  repeat: Infinity,
                  repeatType: "loop",
                  duration: 20,
                  ease: "linear",
                }
              }}
            >
              {[...testimonials, ...testimonials, ...testimonials].map((t, idx) => (
                <motion.div
                  key={idx}
                  className="bg-white p-6 rounded-lg shadow-md w-64 min-h-[220px] flex-shrink-0 flex flex-col justify-between"
                  whileHover={{ scale: 1.02 }}
                  transition={{ duration: 0.2 }}
                >
                  <p className="text-gray-600">&quot;{t.text}&quot;</p>
                  <div className="mt-4 flex items-center">
                    <div className="flex-shrink-0">
                      <Image className="h-10 w-10 rounded-full" src={t.avatar} alt="User" width={40} height={40} />
                    </div>
                    <div className="ml-3">
                      <div className="text-sm font-medium text-gray-900">{t.name}</div>
                      <div className="text-sm text-gray-500">{t.role}</div>
                    </div>
                  </div>
                </motion.div>
              ))}
            </motion.div>
          </div>
        </div>
      </div>
      
    </motion.div>
  );
};

// AnimatedShowcaseImage1: Tilted initially, straightens on view, scale up, fade in
const AnimatedShowcaseImage1 = () => {
  return (
    <motion.div
      initial={{ scale: 0.8, rotate: -16, opacity: 0 }}
      whileInView={{ scale: 1.2, rotate: 0, opacity: 1 }}
      transition={{ type: 'spring', stiffness: 60, damping: 18, duration: 0.8 }}
      viewport={{ once: false, amount: 0.4 }}
      className="h-fit w-fit flex flex-row items-center justify-between bg-transparent rounded-xl gap-6 p-6"
    >
      <div className="flex flex-col items-center justify-center">
        <div className="text-6xl font-semibold text-gray-700 mb-2 text-center">Visualize Your Daily Progress</div>
        <div className="text-white text-center text-xl">See your daily habit completions at a glance with our intuitive dashboard.</div>
      </div>
      <Image src="/images/image 1.png" alt="Track your daily habits visually" width={720} height={720} className="rounded-lg object-cover mb-4" />
    </motion.div>
  );
};

// AnimatedShowcaseImage2: Slide in from left, fade in, scale up
const AnimatedShowcaseImage2 = () => {
  return (
    <motion.div
      initial={{ x: -200, opacity: 0, scale: 0.8 }}
      whileInView={{ x: 0, opacity: 1, scale: 1.1 }}
      transition={{ type: 'spring', stiffness: 70, damping: 16, duration: 0.9 }}
      viewport={{ once: false, amount: 0.4 }}
      className="h-fit w-fit flex flex-row-reverse items-center justify-between bg-transparent rounded-xl gap-6 p-6"
    >
      <div className="flex flex-col items-center justify-center">
        <div className="text-5xl font-semibold text-gray-800 mb-2 text-center">Set and Achieve Your Goals</div>
        <div className="text-white text-center text-xl">Define custom targets and track your progress toward building lasting habits.</div>
      </div>
      <Image src="/images/image 2.png" alt="Set and achieve goals" width={720} height={720} className="rounded-lg object-cover mb-4" />
    </motion.div>
  );
};

// AnimatedShowcaseImage3: Rotate and blur in, fade in
const AnimatedShowcaseImage3 = () => {
  return (
    <motion.div
      initial={{ rotate: -12, opacity: 0, filter: 'blur(8px)' }}
      whileInView={{ rotate: 0, opacity: 1, filter: 'blur(0px)' }}
      transition={{ type: 'spring', stiffness: 60, damping: 18, duration: 1 }}
      viewport={{ once: false, amount: 0.4 }}
      className="h-fit w-fit flex flex-row items-center justify-between bg-transparent rounded-xl gap-6 p-6"
    >
      <div className="flex flex-col items-center justify-center">
        <div className="text-5xl font-semibold text-gray-800 mb-2 text-center">Stay Motivated with Streaks</div>
        <div className="text-white text-center text-xl">Keep your momentum going and never break the chain with streak tracking.</div>
      </div>
      <Image src="/images/image 4.png" alt="Stay motivated with streaks" width={720} height={720} className="rounded-lg object-cover mb-4" />
    </motion.div>
  );
};

// AnimatedShowcaseImage4: Parallax y, color shift, fade in
const AnimatedShowcaseImage4 = () => {
  return (
    <motion.div
      initial={{ y: 100, opacity: 0, filter: 'grayscale(1)' }}
      whileInView={{ y: 0, opacity: 1, filter: 'grayscale(0)' }}
      transition={{ type: 'spring', stiffness: 60, damping: 18, duration: 1 }}
      viewport={{ once: false, amount: 0.4 }}
      className="h-fit w-fit flex flex-row-reverse items-center justify-between bg-transparent rounded-xl gap-6 p-6"
    >
      <div className="flex flex-col items-center justify-center">
        <div className="text-5xl font-semibold text-gray-800 mb-2 text-center">Analyze Your Habit Trends</div>
        <div className="text-white text-center text-xl">Dive deep into your analytics to understand and improve your routines.</div>
      </div>
      <Image src="/images/image 5.png" alt="Analyze your habit trends" width={720} height={720} className="rounded-lg object-cover mb-4" />
    </motion.div>
  );
};

// Add this component before the Dashboard component
const GreetingCard: React.FC<{ userName: string }> = ({ userName }) => {
  const [quote, setQuote] = useState(getRandomQuote());
  const greeting = getGreeting();

  // Update quote every 30 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      setQuote(getRandomQuote());
    }, 30000);

    return () => clearInterval(interval);
  }, []);

  return (
    <motion.div
      initial={{ opacity: 0, y: -20 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-white shadow sm:rounded-lg mb-6"
    >
      <div className="px-4 py-5 sm:p-6">
        <h2 className="text-2xl font-bold text-gray-900 mb-2">
          {greeting}, {userName}!
        </h2>
        <div className="border-l-4 border-indigo-500 pl-4">
          <p className="text-gray-600 italic">{quote}</p>
        </div>
      </div>
    </motion.div>
  );
};

// Add this component before the Dashboard component
const MonthlyHeatmap: React.FC<{ habitLogs: HabitLog[] }> = ({ habitLogs }) => {
  const today = new Date();
  const currentMonth = today.getMonth();
  const currentYear = today.getFullYear();

  // Get the first and last day of the current month
  const firstDay = new Date(currentYear, currentMonth, 1);
  const lastDay = new Date(currentYear, currentMonth + 1, 0);

  // Get all days in the current month
  const daysInMonth = Array.from(
    { length: lastDay.getDate() },
    (_, i) => new Date(currentYear, currentMonth, i + 1)
  );

  // Calculate completion rate for each day
  const dailyCompletion = daysInMonth.map(day => {
    const dayLogs = habitLogs.filter(log => isSameDay(log.date, day));
    const totalHabits = dayLogs.length;
    const completedHabits = dayLogs.filter(log => log.completed).length;
    return {
      date: day,
      completionRate: totalHabits > 0 ? Math.round((completedHabits / totalHabits) * 100) : 0
    };
  });

  // Get the day of the week for the first day of the month
  const firstDayOfWeek = firstDay.getDay();

  // Create an array for the grid with empty cells for days before the first of the month
  const gridDays = [
    ...Array(firstDayOfWeek).fill(null),
    ...dailyCompletion
  ];

  // Calculate number of rows (weeks) needed
  const numRows = Math.ceil(gridDays.length / 7);

  // Build the grid as an array of weeks
  const weeks: (typeof gridDays)[] = [];
  for (let i = 0; i < numRows; i++) {
    weeks.push(gridDays.slice(i * 7, (i + 1) * 7));
  }

  // Color scale (lighter style)
  const getColor = (rate: number) => {
    if (rate === 0) return 'bg-gray-200'; // very light gray
    if (rate < 25) return 'bg-green-200'; // very light green
    if (rate < 50) return 'bg-green-300'; // light green
    if (rate < 75) return 'bg-green-400'; // medium green
    return 'bg-green-500'; // darker but still light
  };

  return (
    <div className="bg-[#f8fafc] rounded-lg p-2 flex flex-col items-center w-fit mx-auto" style={{ minWidth: 80, maxWidth: 120 }}>
      <div className="flex flex-row gap-[3px]">
        {weeks.map((week, wIdx) => (
          <div key={wIdx} className="flex flex-col gap-[3px]">
            {week.map((day, dIdx) => (
              <div
                key={dIdx}
                className={`w-4 h-4 rounded-[3px] ${day === null ? 'bg-transparent' : getColor(day.completionRate)}`}
                title={day && day.date ? `${day.date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}: ${day.completionRate}%` : ''}
              />
            ))}
          </div>
        ))}
      </div>
      <div className="text-xs text-gray-400 mt-2 text-center w-full" style={{letterSpacing:1}}>
        {format(today, 'MMM')}
      </div>
    </div>
  );
};

// UserProfileCard component
const UserProfileCard: React.FC<{ 
  user: User;
  navigate: (view: 'landing' | 'dashboard' | 'habits' | 'stats' | 'habitDetail') => void;
  setIsAuthenticated: (value: boolean) => void;
}> = ({ user, navigate, setIsAuthenticated }) => {
  const [open, setOpen] = useState(false);
  const profileRef = useRef<HTMLDivElement>(null);
  const [avatarError, setAvatarError] = useState(false);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (profileRef.current && !profileRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  return (
    <div ref={profileRef} className="relative bg-white shadow sm:rounded-lg flex flex-col items-center p-4 w-72 min-w-[10rem] self-stretch cursor-pointer ml-4">
      <div className="flex flex-col items-center" onClick={() => setOpen(o => !o)}>
        <div className="relative h-12 w-12 rounded-full mb-2 border-2 border-indigo-200 overflow-hidden">
          {avatarError ? (
            <div className="w-full h-full bg-indigo-100 flex items-center justify-center">
              <span className="text-indigo-600 text-lg font-semibold">
                {user.name.charAt(0)}
              </span>
            </div>
          ) : (
            <Image
              className="object-cover"
              src={user.avatar}
              alt="User avatar"
              width={48}
              height={48}
              onError={() => setAvatarError(true)}
            />
          )}
        </div>
        <div className="font-semibold text-gray-900 text-base text-center">{user.name}</div>
        <div className="text-xs text-gray-500 text-center mb-1">{user.email}</div>
        <svg className={`w-4 h-4 text-gray-400 mt-1 transition-transform ${open ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </div>
      {open && (
        <div className="absolute right-2 top-24 z-10 bg-white border border-gray-200 rounded shadow-lg w-44 animate-fade-in">
          <button className="block w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100" onClick={() => alert('Edit Profile')}>Edit Profile</button>
          <button className="block w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100" onClick={() => alert('Settings')}>Settings</button>
          <button 
            className="block w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50" 
            onClick={() => {
              if (window.confirm('Are you sure you want to log out?')) {
                setIsAuthenticated(false);
                navigate('landing');
              }
            }}
          >
            Log Out
          </button>
        </div>
      )}
    </div>
  );
};

// Dashboard Component
const Dashboard: React.FC<{
  mockData: ReturnType<typeof generateMockData>;
  setSelectedHabit: (habit: Habit | null) => void;
  navigate: (view: 'landing' | 'dashboard' | 'habits' | 'stats' | 'habitDetail') => void;
  checkInHabit: (habitId: string, value: number) => void;
  selectedHabit: Habit | null;
  setDetailedHabit: (habit: Habit) => void;
  setShowAddHabit: (show: boolean) => void;
  setIsAuthenticated: (value: boolean) => void;
}> = ({
  mockData,
  setSelectedHabit,
  navigate,
  checkInHabit,
  selectedHabit,
  setDetailedHabit,
  setShowAddHabit,
  setIsAuthenticated,
}) => {
  const { habits, habitLogs } = mockData;
  const today = new Date();
  const [checkInValue, setCheckInValue] = useState('');
  const [error, setError] = useState('');

  // Filter logs for today
  const todayLogs = habitLogs.filter(log =>
    isSameDay(log.date, today)
  );

  // Get habits that need to be tracked today based on targetDays
  const todayHabits = habits.filter(habit =>
    habit.targetDays.includes(today.getDay())
  );

  // Calculate overall completion rate
  const completionRate = habitLogs.length > 0
    ? Math.round((habitLogs.filter(log => log.completed).length / habitLogs.length) * 100)
    : 0;

  // Get recent activity
  const recentLogs = [...habitLogs]
    .sort((a, b) => b.date.getTime() - a.date.getTime())
    .slice(0, 5);

  // Weekly data for chart
  const startOfCurrentWeek = startOfWeek(today);
  const weekDays = eachDayOfInterval({
    start: startOfCurrentWeek,
    end: addDays(startOfCurrentWeek, 6)
  });

  const weeklyData = weekDays.map(day => {
    const dayLogs = habitLogs.filter(log => isSameDay(log.date, day));
    const totalHabits = dayLogs.length;
    const completedHabits = dayLogs.filter(log => log.completed).length;

    return {
      name: format(day, 'EEE'),
      total: totalHabits,
      completed: completedHabits,
      rate: totalHabits > 0 ? Math.round((completedHabits / totalHabits) * 100) : 0
    };
  });

  // Modal for check-in
  const handleCheckInSubmit = () => {
    if (!selectedHabit) return;
    const value = parseInt(checkInValue, 10);
    if (isNaN(value) || value < 0) {
      setError('Please enter a valid number.');
      return;
    }
    checkInHabit(selectedHabit.id, value);
    setCheckInValue('');
    setError('');
    setSelectedHabit(null);
  };

  // Handler for Add New Habit button
  const handleAddHabitClick = () => {
    setShowAddHabit(true);
    navigate('habits');
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="space-y-6"
    >
      {/* Greeting, Motivation, Add Habit, and Mini Heatmap Row */}
      <div className="flex flex-col md:flex-row gap-4 w-full">
        {/* Greeting, Motivation, Add Habit */}
        <div className="bg-white shadow sm:rounded-lg p-4 flex-1 min-w-0 max-w-xl flex flex-col justify-between">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div className="flex-1 min-w-[180px]">
              <GreetingCard userName={mockData.user.name} />
            </div>
            <div className="flex items-center">
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={handleAddHabitClick}
                className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
              >
                <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                </svg>
                Add New Habit
              </motion.button>
            </div>
          </div>
        </div>
        {/* Mini Heatmap */}
        <div className="bg-white shadow sm:rounded-lg flex flex-col items-center p-2 w-72 min-w-[10rem] ml-4 self-stretch">
          <div className="text-sm font-semibold text-gray-700 mb-2 mt-1">This Month&apos;s Progress</div>
          <MonthlyHeatmap habitLogs={mockData.habitLogs} />
        </div>
        {/* User Profile Card */}
        <UserProfileCard 
          user={mockData.user} 
          navigate={navigate}
          setIsAuthenticated={setIsAuthenticated}
        />
      </div>

      {/* Header */}
      <div className="bg-white shadow sm:rounded-lg">
        <div className="px-4 py-5 sm:p-6">
          <h2 className="text-lg leading-6 font-medium text-gray-900">Today&apos;s Overview</h2>
          <div className="mt-5 grid grid-cols-1 gap-5 sm:grid-cols-3">
            <div className="bg-gray-50 overflow-hidden shadow rounded-lg">
              <div className="px-4 py-5 sm:p-6">
                <dl>
                  <dt className="text-sm font-medium text-gray-500 truncate">Habits Today</dt>
                  <dd className="mt-1 text-3xl font-semibold text-gray-900">{todayHabits.length}</dd>
                </dl>
              </div>
            </div>
            <div className="bg-gray-50 overflow-hidden shadow rounded-lg">
              <div className="px-4 py-5 sm:p-6">
                <dl>
                  <dt className="text-sm font-medium text-gray-500 truncate">Completion Rate</dt>
                  <dd className="mt-1 text-3xl font-semibold text-gray-900">{completionRate}%</dd>
                </dl>
              </div>
            </div>
            <div className="bg-gray-50 overflow-hidden shadow rounded-lg">
              <div className="px-4 py-5 sm:p-6">
                <dl>
                  <dt className="text-sm font-medium text-gray-500 truncate">Longest Streak</dt>
                  <dd className="mt-1 text-3xl font-semibold text-gray-900">
                    {Math.max(...habits.map(h => h.longestStreak))} days
                  </dd>
                </dl>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Today's Habits */}
      <div className="bg-white shadow sm:rounded-lg">
        <div className="px-4 py-5 sm:p-6">
          <h2 className="text-lg leading-6 font-medium text-gray-900">Today&apos;s Habits</h2>
          <div className="mt-5">
            {todayHabits.length > 0 ? (
              <ul className="divide-y divide-gray-200">
                {todayHabits.map(habit => {
                  const habitLog = todayLogs.find(log => log.habitId === habit.id);
                  const completed = habitLog?.completed || false;
                  const progress = habitLog ? Math.round((habitLog.value / habit.targetValue) * 100) : 0;

                  return (
                    <li key={habit.id} className="py-4">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center">
                          <div
                            className="h-10 w-10 rounded-full flex items-center justify-center"
                            style={{ backgroundColor: habit.color + '20' }}
                          >
                            <div className="h-8 w-8 rounded-full" style={{ backgroundColor: habit.color }}></div>
                          </div>
                          <div className="ml-4">
                            <h3 className="text-sm font-medium">{habit.title}</h3>
                            <p className="text-xs text-gray-500">{habit.description}</p>
                          </div>
                        </div>
                        <div className="flex items-center">
                          <div className="mr-4">
                            <div className="text-sm text-gray-900">{habitLog?.value || 0} / {habit.targetValue} {habit.unit}</div>
                            <div className="w-32 h-2 bg-gray-200 rounded-full mt-1">
                              <div
                                className="h-2 rounded-full"
                                style={{
                                  width: `${Math.min(progress, 100)}%`,
                                  backgroundColor: completed ? '#22c55e' : '#9CA3AF'
                                }}
                              ></div>
                            </div>
                          </div>
                          {/* Status Icon and Check In button */}
                          <div className="flex items-center gap-2">
                            {completed ? (
                              <svg className="h-6 w-6 text-green-500" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" aria-label="Completed">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                              </svg>
                            ) : (
                              <svg className="h-6 w-6 text-yellow-500" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" aria-label="Incomplete">
                                <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" fill="none" />
                                <circle cx="12" cy="12" r="2" fill="currentColor" />
                              </svg>
                            )}
                            <button
                              onClick={() => setSelectedHabit(habit)}
                              className="inline-flex items-center px-2.5 py-1.5 border border-transparent text-xs font-medium rounded text-indigo-700 bg-indigo-100 hover:bg-indigo-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
                            >
                              Check In
                            </button>
                          </div>
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <div className="text-center py-6">
                <p className="text-gray-500">No habits scheduled for today.</p>
                <button
                  onClick={() => navigate('habits')}
                  className="mt-2 inline-flex items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
                >
                  Add New Habit
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Weekly Progress */}
      <div className="bg-white shadow sm:rounded-lg">
        <div className="px-4 py-5 sm:p-6">
          <h2 className="text-lg leading-6 font-medium text-gray-900">Weekly Progress</h2>
          <div className="mt-5 h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={weeklyData}
                margin={{ top: 20, right: 30, left: 20, bottom: 5 }}
              >
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" />
                <YAxis />
                <Tooltip />
                <Legend />
                <Bar dataKey="completed" name="Completed" fill="#4C51BF" />
                <Bar dataKey="total" name="Total" fill="#E2E8F0" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Recent Activity */}
      <div className="bg-white shadow sm:rounded-lg">
        <div className="px-4 py-5 sm:p-6">
          <h2 className="text-lg leading-6 font-medium text-gray-900">Recent Activity</h2>
          <div className="mt-5 flow-root">
            <ul className="-my-5 divide-y divide-gray-200">
              {recentLogs.map(log => {
                const habit = habits.find(h => h.id === log.habitId);
                if (!habit) return null;

                return (
                  <li key={log.id} className="py-4">
                    <div className="flex items-center space-x-4">
                      <div
                        className="flex-shrink-0 h-8 w-8 rounded-full"
                        style={{ backgroundColor: habit.color }}
                      ></div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900 truncate">
                          {habit.title}
                        </p>
                        <p className="text-sm text-gray-500 truncate">
                          {log.value} {habit.unit} {log.completed ? '(Completed)' : '(Incomplete)'}
                        </p>
                      </div>
                      <div>
                        <div className="text-sm text-gray-500">
                          {format(log.date, 'MMM d, yyyy')}
                        </div>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
          <div className="mt-6">
            <button
              onClick={() => navigate('stats')}
              className="w-full flex justify-center items-center px-4 py-2 border border-gray-300 shadow-sm text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50"
            >
              View All Activity
            </button>
          </div>
        </div>
      </div>

      {/* Streak Leaders */}
      <div className="bg-white shadow sm:rounded-lg">
        <div className="px-4 py-5 sm:p-6">
          <h2 className="text-lg leading-6 font-medium text-gray-900">Streak Leaders</h2>
          <div className="mt-5 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {[...habits]
              .sort((a, b) => b.streak - a.streak)
              .slice(0, 4)
              .map(habit => (
                <div
                  key={habit.id}
                  className="bg-gray-50 overflow-hidden shadow rounded-lg cursor-pointer hover:bg-gray-100"
                  onClick={() => { setDetailedHabit(habit); navigate('habitDetail'); }}
                >
                  <div className="px-4 py-5 sm:p-6">
                    <div className="flex items-center">
                      <div
                        className="flex-shrink-0 h-10 w-10 rounded-full flex items-center justify-center"
                        style={{ backgroundColor: habit.color + '30' }}
                      >
                        <div className="h-6 w-6 rounded-full" style={{ backgroundColor: habit.color }}></div>
                      </div>
                      <div className="ml-4">
                        <div className="text-sm font-medium text-gray-900">{habit.title}</div>
                        <div className="flex items-center mt-1">
                          <svg className="h-4 w-4 text-yellow-400" xmlns="http://www.w3.org/2000/svg" fill="currentColor" viewBox="0 0 24 24">
                            <path d="M12.5 3.247L14.5 7.3l4.5.658-3.25 3.17.768 4.483-4.018-2.112-4.018 2.112.768-4.483-3.25-3.17 4.5-.658 2-4.053z" />
                          </svg>
                          <span className="ml-1 text-sm text-gray-500">{habit.streak} day streak</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              ))
            }
          </div>
        </div>
      </div>

      {/* Check-In Modal */}
      {selectedHabit && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-40">
          <div className="bg-white rounded-lg shadow-lg p-8 w-full max-w-sm relative">
            <button
              className="absolute top-2 right-2 text-gray-400 hover:text-gray-600"
              onClick={() => { setSelectedHabit(null); setCheckInValue(''); setError(''); }}
              aria-label="Close"
            >
              &times;
            </button>
            <h3 className="text-lg font-bold mb-4 text-gray-900">Check In: {selectedHabit.title}</h3>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Enter value ({selectedHabit.unit}):
            </label>
            <input
              type="number"
              className="w-full border border-gray-300 rounded-md px-3 py-2 mb-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              value={checkInValue}
              onChange={e => setCheckInValue(e.target.value)}
              min={0}
              autoFocus
            />
            {error && <div className="text-red-500 text-xs mb-2">{error}</div>}
            <button
              className="w-full bg-indigo-600 text-white py-2 rounded-md font-medium hover:bg-indigo-700 transition"
              onClick={handleCheckInSubmit}
            >
              Submit
            </button>
          </div>
        </div>
      )}
    </motion.div>
  );
};

type HabitsPageProps = {
  mockData: ReturnType<typeof generateMockData>;
  setDetailedHabit: (habit: Habit) => void;
  navigate: (view: 'landing' | 'dashboard' | 'habits' | 'stats' | 'habitDetail') => void;
  showAddHabit: boolean;
  setShowAddHabit: (show: boolean) => void;
  addHabit: (habit: Omit<Habit, 'id' | 'userId' | 'createdAt' | 'streak' | 'longestStreak'>) => void;
  addHabitError: string;
  setAddHabitError: (err: string) => void;
  setMockData: React.Dispatch<React.SetStateAction<ReturnType<typeof generateMockData>>>;
};

const HabitsPage: React.FC<HabitsPageProps> = ({ mockData, setDetailedHabit, navigate, showAddHabit, setShowAddHabit, addHabit, addHabitError, setAddHabitError, setMockData }) => {
  const [form, setForm] = useState({
    title: '',
    description: '',
    category: '',
    targetDays: [] as number[],
    targetValue: '',
    unit: '',
    color: '#4C51BF',
  });
  const [menuOpen, setMenuOpen] = useState<string | null>(null);
  const [editMode, setEditMode] = useState(false);
  const [editHabitId, setEditHabitId] = useState<string | null>(null);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setForm(f => ({ ...f, [name]: value }));
  };

  const handleDayToggle = (day: number) => {
    setForm(f => ({
      ...f,
      targetDays: f.targetDays.includes(day)
        ? f.targetDays.filter(d => d !== day)
        : [...f.targetDays, day],
    }));
  };

  // Edit habit handler
  const handleEditHabit = (habit: Habit) => {
    setForm({
      title: habit.title,
      description: habit.description,
      category: habit.category,
      targetDays: habit.targetDays,
      targetValue: habit.targetValue.toString(),
      unit: habit.unit,
      color: habit.color,
    });
    setEditMode(true);
    setEditHabitId(habit.id);
    setShowAddHabit(true);
    setMenuOpen(null);
  };

  // Delete habit handler (actual logic)
  const handleDeleteHabit = (habit: Habit) => {
    setMenuOpen(null);
    if (window.confirm(`Are you sure you want to delete the habit "${habit.title}"?`)) {
      setMockData((prevData: ReturnType<typeof generateMockData>) => ({
        ...prevData,
        habits: prevData.habits.filter((h: Habit) => h.id !== habit.id),
        habitLogs: prevData.habitLogs.filter((log: HabitLog) => log.habitId !== habit.id),
      }));
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // Validation
    if (!form.title.trim()) return setAddHabitError('Title is required.');
    if (!form.description.trim()) return setAddHabitError('Description is required.');
    if (!form.category.trim()) return setAddHabitError('Category is required.');
    if (form.targetDays.length === 0) return setAddHabitError('Select at least one target day.');
    if (!form.targetValue || isNaN(Number(form.targetValue)) || Number(form.targetValue) <= 0) return setAddHabitError('Enter a valid target value.');
    if (!form.unit.trim()) return setAddHabitError('Unit is required.');
    setAddHabitError('');
    if (editMode && editHabitId) {
      setMockData((prevData: ReturnType<typeof generateMockData>) => ({
        ...prevData,
        habits: prevData.habits.map((h: Habit) =>
          h.id === editHabitId
            ? {
                ...h,
                title: form.title,
                description: form.description,
                category: form.category,
                targetDays: form.targetDays,
                targetValue: Number(form.targetValue),
                unit: form.unit,
                color: form.color,
              }
            : h
        ),
      }));
      setEditMode(false);
      setEditHabitId(null);
    } else {
      addHabit({
        title: form.title,
        description: form.description,
        category: form.category,
        targetDays: form.targetDays,
        targetValue: Number(form.targetValue),
        unit: form.unit,
        color: form.color,
      });
    }
    setForm({ title: '', description: '', category: '', targetDays: [], targetValue: '', unit: '', color: '#4C51BF' });
    setShowAddHabit(false);
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="space-y-6"
    >
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-white">My Habits</h2>
        <button
          className="px-4 py-2 bg-indigo-600 text-white rounded-md font-medium hover:bg-indigo-700 transition"
          onClick={() => setShowAddHabit(true)}
        >
          + Add New Habit
        </button>
      </div>
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {mockData.habits.map(habit => (
          <div
            key={habit.id}
            className="bg-white shadow rounded-lg p-4 hover:shadow-md transition cursor-pointer relative"
            onClick={() => { setDetailedHabit(habit); navigate('habitDetail'); }}
          >
            {/* Three dots menu */}
            <div
              className="absolute top-2 right-2 z-10"
              onClick={e => { e.stopPropagation(); setMenuOpen(menuOpen === habit.id ? null : habit.id); }}
            >
              <button className="p-1 rounded-full hover:bg-gray-100 focus:outline-none">
                <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <circle cx="5" cy="12" r="1.5" />
                  <circle cx="12" cy="12" r="1.5" />
                  <circle cx="19" cy="12" r="1.5" />
                </svg>
              </button>
              {menuOpen === habit.id && (
                <div className="absolute right-0 mt-2 w-32 bg-white border border-gray-200 rounded shadow-lg z-20">
                  <button
                    className="block w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                    onClick={e => { e.stopPropagation(); handleEditHabit(habit); }}
                  >Edit</button>
                  <button
                    className="block w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50"
                    onClick={e => { e.stopPropagation(); handleDeleteHabit(habit); }}
                  >Delete</button>
                </div>
              )}
            </div>
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold text-gray-800">{habit.title}</h3>
              <span className="text-sm" style={{ color: habit.color }}>{habit.category}</span>
            </div>
            <p className="text-sm text-gray-600 mt-2">{habit.description}</p>
            <div className="mt-4 text-sm text-gray-500">
              <p>Streak: 🔥 {habit.streak} days</p>
              <p>Longest: 🏆 {habit.longestStreak} days</p>
              <p>Target: {habit.targetValue} {habit.unit}/day</p>
            </div>
          </div>
        ))}
      </div>
      {/* Add Habit Modal */}
      {showAddHabit && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-40">
          <form onSubmit={handleSubmit} className="bg-white rounded-lg shadow-lg p-8 w-full max-w-md relative">
            <button
              className="absolute top-2 right-2 text-gray-400 hover:text-gray-600"
              onClick={() => { setShowAddHabit(false); setAddHabitError(''); }}
              type="button"
              aria-label="Close"
            >
              &times;
            </button>
            <h3 className="text-lg font-bold mb-4 text-gray-900">Add New Habit</h3>
            <label className="block text-sm font-medium text-gray-700 mb-1">Habit Name</label>
            <input name="title" value={form.title} onChange={handleChange} className="w-full border border-gray-300 rounded-md px-3 py-2 mb-2" required />
            <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
            <textarea name="description" value={form.description} onChange={handleChange} className="w-full border border-gray-300 rounded-md px-3 py-2 mb-2" required />
            <label className="block text-sm font-medium text-gray-700 mb-1">Category</label>
            <input name="category" value={form.category} onChange={handleChange} className="w-full border border-gray-300 rounded-md px-3 py-2 mb-2" required />
            <label className="block text-sm font-medium text-gray-700 mb-1">Target Days</label>
            <div className="flex gap-2 mb-2">
              {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d, i) => (
                <button
                  type="button"
                  key={i}
                  className={`px-2 py-1 rounded ${form.targetDays.includes(i) ? 'bg-indigo-600 text-white' : 'bg-gray-200 text-gray-700'}`}
                  onClick={() => handleDayToggle(i)}
                >
                  {d}
                </button>
              ))}
            </div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Target Value</label>
            <input name="targetValue" value={form.targetValue} onChange={handleChange} type="number" min="1" className="w-full border border-gray-300 rounded-md px-3 py-2 mb-2" required />
            <label className="block text-sm font-medium text-gray-700 mb-1">Unit (e.g. pages, minutes)</label>
            <input name="unit" value={form.unit} onChange={handleChange} className="w-full border border-gray-300 rounded-md px-3 py-2 mb-2" required />
            <label className="block text-sm font-medium text-gray-700 mb-1">Color</label>
            <input name="color" value={form.color} onChange={handleChange} type="color" className="w-12 h-8 p-0 border-0 mb-2" />
            {addHabitError && <div className="text-red-500 text-xs mb-2">{addHabitError}</div>}
            <button className="w-full bg-indigo-600 text-white py-2 rounded-md font-medium hover:bg-indigo-700 transition mt-2" type="submit">
              Add Habit
            </button>
          </form>
        </div>
      )}
    </motion.div>
  );
};

const StatsPage: React.FC<{ mockData: ReturnType<typeof generateMockData> }> = ({ mockData }) => {
  const { habits, habitLogs } = mockData;

  // Aggregate total completions per habit
  const statsData = habits.map(habit => {
    const logs = habitLogs.filter(log => log.habitId === habit.id);
    const completed = logs.filter(log => log.completed).length;
    return {
      name: habit.title,
      completed,
      color: habit.color
    };
  });

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="space-y-8"
    >
      <h2 className="text-2xl font-bold text-white">Analytics Overview</h2>

      {/* Bar Chart */}
      <div className="bg-white p-6 rounded-lg shadow">
        <h3 className="text-lg font-medium text-gray-800 mb-4">Habit Completion Count</h3>
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={statsData}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="name" />
            <YAxis allowDecimals={false} />
            <Tooltip />
            <Bar dataKey="completed">
              {statsData.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={entry.color} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Pie Chart */}
      <div className="bg-white p-6 rounded-lg shadow">
        <h3 className="text-lg font-medium text-gray-800 mb-4">Habit Distribution</h3>
        <ResponsiveContainer width="100%" height={300}>
          <PieChart>
            <Pie
              data={statsData}
              dataKey="completed"
              nameKey="name"
              cx="50%"
              cy="50%"
              outerRadius={100}
              label
            >
              {statsData.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={entry.color} />
              ))}
            </Pie>
            <Tooltip />
          </PieChart>
        </ResponsiveContainer>
      </div>
    </motion.div>
  );
};

// Use correct types for props
interface HabitDetailPageProps {
  habit: Habit;
  habitLogs: HabitLog[];
  onBack: () => void;
}

const HabitDetailPage: React.FC<HabitDetailPageProps> = ({ habit, habitLogs, onBack }) => {
  const today = new Date();
  const years = Array.from(new Set(habitLogs.map(l => new Date(l.date).getFullYear()))).sort((a, b) => a - b);
  const defaultYear = years.includes(today.getFullYear())
    ? today.getFullYear()
    : (years.length > 0 ? years[0] : today.getFullYear());
  const [selectedYear, setSelectedYear] = React.useState<number>(defaultYear);
  const [activeTab, setActiveTab] = React.useState<'calendar' | 'trends'>("calendar");
  const [hovered, setHovered] = React.useState<{ week: number; day: number } | null>(null);

  // Helper function to check leap year
  function isLeapYear(year: number): boolean {
    return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
  }

  // Get all days in the selected year
  const start = new Date(selectedYear, 0, 1);
  const end = new Date(selectedYear, 11, 31);
  // Find the first Sunday before or on Jan 1
  const firstSunday = new Date(start);
  firstSunday.setDate(firstSunday.getDate() - firstSunday.getDay());
  // Find the last Saturday after or on Dec 31
  const lastSaturday = new Date(end);
  lastSaturday.setDate(lastSaturday.getDate() + (6 - lastSaturday.getDay()));

  // Build the days array for the grid (weeks x days)
  const days: Date[] = [];
  for (let d = new Date(firstSunday); d <= lastSaturday; d.setDate(d.getDate() + 1)) {
    days.push(new Date(d));
  }

  // Calculate stats
  const totalDaysInYear = 365 + (isLeapYear(selectedYear) ? 1 : 0);
  const logsThisYear = habitLogs.filter(log =>
    log &&
    log.date &&
    new Date(log.date).getFullYear() === selectedYear &&
    log.habitId === habit.id
  );
  const completedDaysCount = logsThisYear.filter(log => log.completed).length;
  const completionRate = totalDaysInYear > 0
    ? Math.round((completedDaysCount / totalDaysInYear) * 100)
    : 0;

  // Calculate monthly stats safely
  const monthlyStats = Array(12).fill(0).map((_, idx) => {
    const month = idx;
    const daysInMonth = new Date(selectedYear, month + 1, 0).getDate();
    const logsInMonth = logsThisYear.filter(log =>
      log && log.date && new Date(log.date).getMonth() === month
    );
    const completedInMonth = logsInMonth.filter(log => log.completed).length;
    const rate = daysInMonth > 0 ? Math.round((completedInMonth / daysInMonth) * 100) : 0;
    return {
      month,
      monthName: new Date(selectedYear, month, 1).toLocaleString('default', { month: 'short' }),
      completed: completedInMonth,
      total: daysInMonth,
      rate
    };
  });

  // Map each day to log status
  const dayStatus = days.map(day => {
    const log = habitLogs.find(l =>
      l.habitId === habit.id &&
      new Date(l.date).toDateString() === day.toDateString()
    );
    return {
      date: day,
      completed: log ? !!log.completed : false,
      inSelectedYear: day.getFullYear() === selectedYear
    };
  });

  // Build weeks (columns)
  const weekCount = Math.ceil(days.length / 7);
  const weeks: { date: Date; completed: boolean; inSelectedYear: boolean; }[][] = [];
  for (let w = 0; w < weekCount; w++) {
    weeks.push(dayStatus.slice(w * 7, w * 7 + 7));
  }

  // Month labels above the grid
  const monthLabels: (string | null)[] = [];
  for (let w = 0; w < weekCount; w++) {
    const weekStart = days[w * 7];
    if (w === 0 || weekStart.getMonth() !== days[(w - 1) * 7].getMonth()) {
      monthLabels[w] = weekStart.toLocaleString('default', { month: 'short' });
    } else {
      monthLabels[w] = null;
    }
  }

  // Day labels for the grid
  const dayLabels = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

  function getCompletionColor(completed: boolean, inSelectedYear: boolean) {
    if (!inSelectedYear) return "bg-gray-900";
    return completed ? `bg-green-600` : "bg-gray-800";
  }

  // Calculate average monthly completions
  const monthsElapsed = today.getFullYear() === selectedYear
    ? Math.max(1, today.getMonth() + 1)
    : 12;
  const monthlyAverage = Math.round(completedDaysCount / monthsElapsed);

  return (
    <div className="bg-gray-950 text-white min-h-screen p-6 rounded-lg space-y-6">
      {/* Header with back button */}
      <div className="flex justify-between items-center">
        <button
          onClick={onBack}
          className="flex items-center text-gray-300 hover:text-white transition-colors"
        >
          {/* Simple ChevronLeft SVG */}
          <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" /></svg>
          <span className="ml-1">Back</span>
        </button>
      </div>
      {/* Habit information */}
      <div className="flex items-center gap-4 bg-gray-900 p-6 rounded-xl shadow-lg">
        <div
          className="h-16 w-16 rounded-full flex items-center justify-center"
          style={{ backgroundColor: `${habit.color}20` }}
        >
          <div
            className="h-12 w-12 rounded-full flex items-center justify-center"
            style={{ backgroundColor: habit.color }}
          >
            {/* Simple Calendar SVG */}
            <svg width="24" height="24" fill="none" stroke="white" strokeWidth="2" viewBox="0 0 24 24"><rect x="3" y="8" width="18" height="13" rx="2" /><path d="M16 2v4M8 2v4M3 10h18" /></svg>
          </div>
        </div>
        <div className="flex-1">
          <h2 className="text-2xl font-bold text-white">{habit.title}</h2>
          <p className="text-gray-300">{habit.description}</p>
          <div className="flex gap-4 mt-2">
            <div className="flex items-center">
              {/* Award SVG */}
              <svg width="18" height="18" fill="none" stroke="#4ade80" strokeWidth="2" viewBox="0 0 24 24"><circle cx="12" cy="8" r="7" /><path d="M8.21 13.89l-1.2 4.36a1 1 0 001.45 1.12l3.54-2.06 3.54 2.06a1 1 0 001.45-1.12l-1.2-4.36" /></svg>
              <span className="text-sm text-gray-300 ml-1">Current streak:</span>
              <span className="text-green-400 font-bold ml-1">{habit.streak} days</span>
            </div>
            <div className="flex items-center">
              {/* TrendingUp SVG */}
              <svg width="18" height="18" fill="none" stroke="#fde047" strokeWidth="2" viewBox="0 0 24 24"><path d="M3 17l6-6 4 4 8-8" /><path d="M14 7h7v7" /></svg>
              <span className="text-sm text-gray-300 ml-1">Longest:</span>
              <span className="text-yellow-300 font-bold ml-1">{habit.longestStreak} days</span>
            </div>
          </div>
        </div>
      </div>
      {/* Statistics cards */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-gray-900 p-4 rounded-lg">
          <p className="text-gray-400 text-sm">This year</p>
          <p className="text-2xl font-bold">{completedDaysCount} days</p>
          <div className="mt-2 h-2 bg-gray-800 rounded-full overflow-hidden">
            <div
              className="h-full bg-green-500 rounded-full"
              style={{ width: `${completionRate}%` }}
            ></div>
          </div>
          <p className="text-xs text-gray-400 mt-1">{completionRate}% complete</p>
        </div>
        <div className="bg-gray-900 p-4 rounded-lg">
          <p className="text-gray-400 text-sm">Average</p>
          <p className="text-2xl font-bold">{monthlyAverage} / month</p>
          <p className="text-xs text-gray-400 mt-1">Days completed on average</p>
        </div>
        <div className="bg-gray-900 p-4 rounded-lg">
          <p className="text-gray-400 text-sm">Success rate</p>
          <p className="text-2xl font-bold">{completionRate}%</p>
          <p className="text-xs text-gray-400 mt-1">Of days completed</p>
        </div>
      </div>
      {/* Tab navigation */}
      <div className="border-b border-gray-800">
        <nav className="flex -mb-px">
          <button
            onClick={() => setActiveTab("calendar")}
            className={`mr-8 py-4 px-1 border-b-2 font-medium text-sm ${
              activeTab === "calendar"
                ? "border-indigo-500 text-indigo-400"
                : "border-transparent text-gray-400 hover:text-gray-300 hover:border-gray-700"
            }`}
          >
            Calendar View
          </button>
          <button
            onClick={() => setActiveTab("trends")}
            className={`mr-8 py-4 px-1 border-b-2 font-medium text-sm ${
              activeTab === "trends"
                ? "border-indigo-500 text-indigo-400"
                : "border-transparent text-gray-400 hover:text-gray-300 hover:border-gray-700"
            }`}
          >
            Monthly Trends
          </button>
        </nav>
      </div>
      {/* Content based on active tab */}
      <div className="mt-6">
        {activeTab === "calendar" && (
          <div className="space-y-6">
            <div className="flex justify-between items-center">
              <h3 className="text-lg font-semibold text-white">
                Yearly Progress - {selectedYear}
              </h3>
              <div className="flex gap-2">
                {years.map(year => (
                  <button
                    key={year}
                    onClick={() => setSelectedYear(year)}
                    className={`px-3 py-1 text-sm rounded-md transition-colors ${
                      selectedYear === year
                        ? "bg-indigo-600 text-white"
                        : "bg-gray-800 text-gray-300 hover:bg-gray-700"
                    }`}
                  >
                    {year}
                  </button>
                ))}
              </div>
            </div>
            <div className="relative">
              {/* Month labels */}
              <div className="flex mb-1 pl-10">
                {monthLabels.map((label, idx) => (
                  <div key={idx} className="w-4 flex justify-center">
                    {label && (
                      <span className="text-xs text-gray-400 font-medium">{label}</span>
                    )}
                  </div>
                ))}
              </div>
              {/* Day labels and Grid */}
              <div className="flex">
                {/* Day labels */}
                <div className="flex flex-col mr-2 text-right">
                  {dayLabels.map((day, idx) => (
                    <div key={idx} className="h-4 text-xs text-gray-500 flex items-center justify-end w-8">
                      {day}
                    </div>
                  ))}
                </div>
                {/* Grid */}
                <div className="flex flex-1">
                  {weeks.map((week, wIdx) => (
                    <div key={wIdx} className="flex flex-col gap-1">
                      {week.map((dayObj, dIdx) => (
                        <div key={dIdx} className="relative">
                          <div
                            className={`w-4 h-4 rounded-sm ${getCompletionColor(dayObj.completed, dayObj.inSelectedYear)}`}
                            onMouseEnter={() => setHovered({ week: wIdx, day: dIdx })}
                            onMouseLeave={() => setHovered(null)}
                          />
                          {hovered && hovered.week === wIdx && hovered.day === dIdx && (
                            <div className="absolute z-10 bg-gray-900 text-white text-xs rounded px-2 py-1 -mt-8 left-1/2 -translate-x-1/2 whitespace-nowrap pointer-events-none">
                              {week[dIdx].date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                              <div>{week[dIdx].completed ? "✅ Completed" : "❌ Missed"}</div>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              </div>
              {/* Legend */}
              <div className="flex items-center gap-4 mt-4 justify-end text-sm text-gray-400">
                <div className="flex items-center">
                  <div className="w-3 h-3 rounded bg-gray-800 mr-2"></div>
                  <span>Not completed</span>
                </div>
                <div className="flex items-center">
                  <div className="w-3 h-3 rounded bg-green-600 mr-2"></div>
                  <span>Completed</span>
                </div>
                <div className="flex items-center">
                  <div className="w-3 h-3 rounded bg-gray-900 mr-2"></div>
                  <span>Out of year</span>
                </div>
              </div>
            </div>
          </div>
        )}
        {activeTab === "trends" && (
          <div className="space-y-4">
            <h3 className="text-lg font-semibold text-white">Monthly Completion Rates - {selectedYear}</h3>
            <div className="bg-gray-900 p-4 rounded-lg">
              <div className="flex h-64">
                {/* Bar chart */}
                {monthlyStats.map((monthData) => (
                  <div key={monthData.month} className="flex flex-col justify-end items-center flex-1">
                    <div
                      className="w-6 bg-indigo-600 rounded-t"
                      style={{ height: `${monthData.rate}%` }}
                    ></div>
                    <div className="text-xs text-gray-400 mt-1">{monthData.monthName}</div>
                    <div className="text-xs font-bold">{monthData.rate}%</div>
                  </div>
                ))}
              </div>
            </div>
            <div className="bg-gray-900 p-4 rounded-lg">
              <h4 className="text-md font-semibold mb-2">Monthly Breakdown</h4>
              <div className="grid grid-cols-3 gap-4">
                {monthlyStats.map((monthData) => (
                  <div key={monthData.month} className="p-3 bg-gray-800 rounded">
                    <div className="text-sm font-medium">{monthData.monthName}</div>
                    <div className="text-lg font-bold">{monthData.completed} / {monthData.total}</div>
                    <div className="h-1 bg-gray-700 rounded-full mt-1 overflow-hidden">
                      <div
                        className={`h-full rounded-full ${monthData.rate > 50 ? 'bg-green-500' : 'bg-yellow-500'}`}
                        style={{ width: `${monthData.rate}%` }}
                      ></div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

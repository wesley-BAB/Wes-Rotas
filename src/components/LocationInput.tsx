import React, { useState, useEffect, useRef } from 'react';
import { Search, Loader2 } from 'lucide-react';
import { cn } from '../lib/utils';

interface Suggestion {
  display_name: string;
  lat: string;
  lon: string;
}

interface LocationInputProps {
  value: string;
  onChange: (value: string, lat?: number, lon?: number) => void;
  placeholder: string;
  className?: string;
  icon?: React.ReactNode;
}

export function LocationInput({ value, onChange, placeholder, className, icon }: LocationInputProps) {
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [loading, setLoading] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const debounceTimer = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setShowSuggestions(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const fetchSuggestions = async (query: string) => {
    if (query.length < 3) {
      setSuggestions([]);
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=5&addressdetails=1`);
      const data = await res.json();
      setSuggestions(data);
      setShowSuggestions(true);
    } catch (error) {
      console.error('Autocomplete error:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    onChange(val);

    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    
    debounceTimer.current = setTimeout(() => {
      fetchSuggestions(val);
    }, 500);
  };

  const handleSelect = (s: Suggestion) => {
    onChange(s.display_name, parseFloat(s.lat), parseFloat(s.lon));
    setShowSuggestions(false);
    setSuggestions([]);
  };

  return (
    <div className="relative w-full" ref={containerRef}>
      <div className="flex items-center gap-3">
        {icon && icon}
        <div className="relative w-full">
          <input
            type="text"
            value={value}
            onChange={handleInputChange}
            onFocus={() => suggestions.length > 0 && setShowSuggestions(true)}
            placeholder={placeholder}
            className={cn(
              "w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all pr-10",
              className
            )}
          />
          {loading && (
            <div className="absolute right-3 top-3.5">
              <Loader2 className="w-4 h-4 text-slate-400 animate-spin" />
            </div>
          )}
        </div>
      </div>

      {showSuggestions && suggestions.length > 0 && (
        <div className="absolute z-50 w-[calc(100%-3.25rem)] left-13 mt-1 bg-white border border-slate-200 rounded-xl shadow-xl overflow-hidden max-h-60 overflow-y-auto">
          {suggestions.map((s, idx) => (
            <button
              key={idx}
              className="w-full text-left px-4 py-3 hover:bg-slate-50 transition-colors text-sm text-slate-700 border-b border-slate-50 last:border-none flex items-start gap-2"
              onClick={() => handleSelect(s)}
            >
              <Search className="w-4 h-4 text-slate-300 mt-0.5 shrink-0" />
              <span className="truncate">{s.display_name}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

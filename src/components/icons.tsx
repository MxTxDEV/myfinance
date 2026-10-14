import {
  Briefcase, PlusCircle, Hammer, ShoppingBag, Percent, TrendingUp, Undo2, Tag, Utensils, ShoppingCart, Bus, Fuel, Home,
  HeartPulse, Dumbbell, Popcorn, Repeat, Laptop, GraduationCap, Landmark, Car, Receipt, Wallet, type LucideIcon,
} from "lucide-react";

const MAP: Record<string, LucideIcon> = {
  briefcase: Briefcase, "plus-circle": PlusCircle, hammer: Hammer, "shopping-bag": ShoppingBag, percent: Percent,
  "trending-up": TrendingUp, "undo-2": Undo2, tag: Tag, utensils: Utensils, "shopping-cart": ShoppingCart, bus: Bus,
  fuel: Fuel, home: Home, "heart-pulse": HeartPulse, dumbbell: Dumbbell, popcorn: Popcorn, repeat: Repeat, laptop: Laptop,
  "graduation-cap": GraduationCap, landmark: Landmark, car: Car, receipt: Receipt, wallet: Wallet,
};
export function CategoryIcon({ name, className }: { name?: string | null; className?: string }) {
  const I = (name && MAP[name]) || Tag;
  return <I aria-hidden className={className} />;
}

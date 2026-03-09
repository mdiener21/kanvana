/**
 * Lucide Icons - Tree-shakeable import
 * Only imports icons used in the application for optimal bundle size.
 */
import {
  createIcons,
  SquareKanban,
  Kanban,
  Search,
  Plus,
  Settings,
  Columns3,
  Tag,
  SlidersHorizontal,
  Download,
  Upload,
  Moon,
  Sun,
  HelpCircle,
  EllipsisVertical,
  Trash2,
  GripVertical,
  Pencil,
  Fullscreen,
  ChartColumn,
  CalendarDays,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronsRightLeft,
  ArrowUpDown,
  X,
  Bell,
  BellRing,
  Maximize2,
  Minimize2,
  User,
  RefreshCw
} from 'lucide';

// Map of all icons used in the app (PascalCase keys for createIcons)
const icons = {
  SquareKanban,
  Kanban,
  Search,
  Plus,
  Settings,
  Columns3,
  Tag,
  SlidersHorizontal,
  Download,
  Upload,
  Moon,
  Sun,
  HelpCircle,
  EllipsisVertical,
  Trash2,
  GripVertical,
  Pencil,
  Fullscreen,
  ChartColumn,
  CalendarDays,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronsRightLeft,
  ArrowUpDown,
  X,
  Bell,
  BellRing,
  Maximize2,
  Minimize2,
  User,
  RefreshCw
};

/**
 * Renders all Lucide icons in the DOM.
 * Call this after dynamically adding elements with data-lucide attributes.
 */
export function renderIcons() {
  createIcons({ icons });
}

// Initialize icons on module load for static HTML elements
renderIcons();

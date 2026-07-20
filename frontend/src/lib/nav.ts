export interface NavItem {
  href: string;
  label: string;
  description: string;
}

export const NAV_ITEMS: NavItem[] = [
  { href: "/", label: "War Room", description: "Live 3D network map" },
  { href: "/risk", label: "Corridor Risk", description: "Bayesian disruption scoring" },
  { href: "/intelligence", label: "Intelligence", description: "Live news signal feed" },
  { href: "/scenario", label: "Scenario Console", description: "Simulate a disruption" },
  { href: "/network", label: "Network", description: "Suppliers, refineries, routes" },
  { href: "/assumptions", label: "Assumptions", description: "Model parameters" },
  { href: "/sources", label: "Sources", description: "Data provenance and method" },
];

import "./globals.css";

export const metadata = {
  title: "Lurkr — always watching, never blinking",
  description: "Multi-agent market intelligence. The intelligence team that never sleeps.",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Lurkr",
  },
};

export const viewport = {
  themeColor: "#0a0a0f",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}

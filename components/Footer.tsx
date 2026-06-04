"use client";

export default function Footer() {
  const year = new Date().getFullYear();

  return (
    <footer className="bg-asphalt py-4 mt-auto border-t-4 border-terracotta">
      <div className="max-w-4xl mx-auto px-4">
        <p className="text-center font-marker text-sm text-sticker-white">
          <span className="text-terracotta">Hoops</span>
          <span className="text-moss-green"> Master</span>
          <span className="opacity-80"> © {year}</span>
        </p>
      </div>
    </footer>
  );
}

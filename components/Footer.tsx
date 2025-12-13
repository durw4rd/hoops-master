"use client";

export default function Footer() {
  return (
    <footer className="bg-[#1A1A1A] py-4 mt-auto border-t-4 border-[#FF6B1A]">
      <div className="max-w-4xl mx-auto px-4">
        <p className="text-center font-marker text-sm text-[#F2EFE9]/60">
          <span className="text-[#FF6B1A]">Hoops</span>
          <span className="text-[#7FFF00]"> Master</span> &copy; {new Date().getFullYear()}
        </p>
      </div>
    </footer>
  );
}

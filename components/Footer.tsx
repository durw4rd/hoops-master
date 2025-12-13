import { useState, useEffect } from 'react';

const Footer: React.FC = () => {
  const [version, setVersion] = useState<string>('');

  useEffect(() => {
    const fetchVersion = async () => {
      try {
        const response = await fetch('/api/version');
        const data = await response.json();
        setVersion(data.version);
      } catch (error) {
        console.error('Failed to fetch version:', error);
        setVersion('2.8.0'); // fallback
      }
    };

    fetchVersion();
  }, []);

  return (
    <footer className="py-2 px-4 text-center">
      <div className="text-xs text-gray-400 space-y-1">
        <div>v{version}</div>
        <div>Built for Het Marnix ballers by Cursor AI. <br/> No robots were harmed in the process.</div>
      </div>
    </footer>
  );
};

export default Footer; 
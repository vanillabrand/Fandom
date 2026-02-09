import React, { useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';

interface AccordionItem {
    id: string;
    title: string;
    content: React.ReactNode;
    defaultOpen?: boolean;
}

interface AccordionListProps {
    items: AccordionItem[];
    allowMultiple?: boolean;
}

export const AccordionList: React.FC<AccordionListProps> = ({ items, allowMultiple = true }) => {
    const [openItems, setOpenItems] = useState<Set<string>>(new Set(
        items.filter(i => i.defaultOpen).map(i => i.id)
    ));

    const toggle = (id: string) => {
        const newOpen = new Set(allowMultiple ? openItems : []);
        if (openItems.has(id)) {
            newOpen.delete(id);
        } else {
            newOpen.add(id);
        }
        setOpenItems(newOpen);
    };

    return (
        <div className="flex flex-col gap-2 h-full overflow-y-auto pr-2 custom-scrollbar">
            {items.map((item) => {
                const isOpen = openItems.has(item.id);
                return (
                    <div
                        key={item.id}
                        className={`border rounded-lg transition-all duration-200 ${isOpen
                                ? 'bg-[#050B14] border-[#1A2C42]'
                                : 'bg-[#050B14]/50 border-transparent hover:border-[#1A2C42]'
                            }`}
                    >
                        <button
                            onClick={() => toggle(item.id)}
                            className="w-full flex items-center justify-between p-3 text-left focus:outline-none"
                        >
                            <span className={`text-sm font-bold ${isOpen ? 'text-white' : 'text-gray-400'}`}>
                                {item.title}
                            </span>
                            {isOpen ? (
                                <ChevronDown size={16} className="text-emerald-500" />
                            ) : (
                                <ChevronRight size={16} className="text-gray-500" />
                            )}
                        </button>

                        {isOpen && (
                            <div className="p-3 border-t border-[#1A2C42] animate-in slide-in-from-top-1">
                                {item.content}
                            </div>
                        )}
                    </div>
                );
            })}
        </div>
    );
};

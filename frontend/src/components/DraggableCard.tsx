import React from 'react';
import { useDraggable } from '@dnd-kit/core';

interface DraggableCardProps {
    id: string;
    disabled?: boolean;
    children: React.ReactNode;
}

export const DraggableCard: React.FC<DraggableCardProps> = ({ id, disabled, children }) => {
    const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
        id: id,
        disabled: disabled,
    });

    const style = {
        opacity: isDragging ? 0.5 : 1,
        cursor: disabled ? 'default' : 'grab',
        touchAction: 'none', // Required for PointerSensor
    };

    return (
        <div ref={setNodeRef} style={style} {...listeners} {...attributes}>
            {children}
        </div>
    );
};

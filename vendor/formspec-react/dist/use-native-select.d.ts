import { type SyntheticEvent } from 'react';
export declare function useNativeSelect(onValueChange?: (value: string) => void): {
    ref: import("react").RefObject<HTMLSelectElement | null>;
    onInput: (event: SyntheticEvent<HTMLSelectElement>) => void;
    onChange: (event: SyntheticEvent<HTMLSelectElement>) => void;
};

/** @filedesc FileUpload with drag-drop zone and maxSize validation. */
'use client';
import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useEffect, useRef, useState } from 'react';
import { formatBytes } from '../format-bytes';
function filesFromFieldValue(value, multiple) {
    if (value == null)
        return [];
    if (value instanceof File)
        return [value];
    if (Array.isArray(value)) {
        return value.filter((entry) => entry instanceof File);
    }
    if (multiple)
        return [];
    return [];
}
function fileListsMatch(a, b) {
    if (a.length !== b.length)
        return false;
    return a.every((file, index) => {
        const other = b[index];
        return (file === other
            || (file.name === other.name
                && file.size === other.size
                && file.lastModified === other.lastModified));
    });
}
/** Engine coercion JSON-roundtrips File to `{}` — do not drop local picks on that artifact. */
function shouldPreserveLocalFiles(value, prev, next) {
    if (next.length > 0 || prev.length === 0 || value == null)
        return false;
    if (value instanceof File)
        return false;
    if (Array.isArray(value) && value.some((entry) => entry instanceof File))
        return false;
    return true;
}
/** Item 22: FileUpload with drag-drop zone and maxSize validation. */
export function FileUploadControl({ field, node, common, isReadonly }) {
    const accept = node.props?.accept;
    const multiple = node.props?.multiple;
    const maxSize = node.props?.maxSize;
    const dragDrop = node.props?.dragDrop !== false;
    const [sizeError, setSizeError] = useState(null);
    const [isDragOver, setIsDragOver] = useState(false);
    const [files, setFiles] = useState(() => filesFromFieldValue(field.value, multiple));
    const fileInputRef = useRef(null);
    useEffect(() => {
        const next = filesFromFieldValue(field.value, multiple);
        setFiles((prev) => {
            if (fileListsMatch(prev, next))
                return prev;
            if (shouldPreserveLocalFiles(field.value, prev, next))
                return prev;
            return next;
        });
        if (field.value == null)
            setSizeError(null);
    }, [field.value, multiple]);
    const addFiles = (incoming) => {
        if (!incoming || incoming.length === 0)
            return;
        const newFiles = Array.from(incoming);
        if (maxSize != null) {
            const oversized = newFiles.find(f => f.size > maxSize);
            if (oversized) {
                setSizeError(`"${oversized.name}" exceeds the maximum size of ${formatBytes(maxSize)}.`);
                return;
            }
        }
        setSizeError(null);
        if (multiple) {
            // Accumulate — deduplicate by name+size+lastModified
            const merged = [...files];
            for (const f of newFiles) {
                if (!merged.some(e => e.name === f.name && e.size === f.size && e.lastModified === f.lastModified)) {
                    merged.push(f);
                }
            }
            setFiles(merged);
            field.setValue(merged);
        }
        else {
            setFiles([newFiles[0]]);
            field.setValue(newFiles[0]);
        }
        // Reset the input so the same file can be re-selected after removal
        if (fileInputRef.current)
            fileInputRef.current.value = '';
    };
    const removeFile = (index) => {
        const next = files.filter((_, i) => i !== index);
        setFiles(next);
        field.setValue(next.length > 0 ? (multiple ? next : next[0]) : null);
        field.touch();
    };
    const clearAll = () => {
        setFiles([]);
        setSizeError(null);
        field.setValue(null);
        field.touch();
    };
    const hiddenInput = (_jsx("input", { ...common, ref: fileInputRef, type: "file", className: "formspec-file-input-hidden", disabled: isReadonly, accept: accept, multiple: multiple, onChange: (e) => addFiles(e.target.files) }));
    const fileList = files.length > 0 && (_jsxs("ul", { className: "formspec-file-list", "aria-label": "Selected files", children: [files.map((f, i) => (_jsxs("li", { className: "formspec-file-list-item", children: [_jsx("span", { className: "formspec-file-list-name", children: f.name }), _jsx("span", { className: "formspec-file-list-size", children: formatBytes(f.size) }), !isReadonly && (_jsx("button", { type: "button", className: "formspec-file-list-remove", "aria-label": `Remove ${f.name}`, onClick: () => removeFile(i), children: _jsx("span", { "aria-hidden": "true", children: "\u00D7" }) }))] }, `${f.name}-${f.lastModified}`))), multiple && files.length > 1 && !isReadonly && (_jsx("li", { className: "formspec-file-list-actions", children: _jsx("button", { type: "button", className: "formspec-file-list-clear", onClick: clearAll, children: "Clear all" }) }))] }));
    const errorEl = sizeError && (_jsx("p", { className: "formspec-file-size-error formspec-error", children: sizeError }));
    const browseBtnClass = 'formspec-file-browse-btn formspec-focus-ring formspec-button-secondary';
    if (!dragDrop) {
        // Siblings only — formspec-file-upload lives on the field root (parity with default web component adapter).
        return (_jsxs(_Fragment, { children: [hiddenInput, _jsxs("button", { type: "button", className: browseBtnClass, onClick: () => fileInputRef.current?.click(), disabled: isReadonly, children: ["Choose file", multiple ? 's' : ''] }), fileList, errorEl] }));
    }
    return (_jsxs(_Fragment, { children: [_jsx("div", { className: `formspec-file-drop-zone formspec-focus-ring${isDragOver ? ' formspec-file-drop-zone--active' : ''}`, tabIndex: isReadonly ? -1 : 0, role: "button", "aria-label": "Drop files here or click to browse", onKeyDown: (e) => {
                    if (isReadonly)
                        return;
                    if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        fileInputRef.current?.click();
                    }
                }, onDragOver: (e) => { e.preventDefault(); setIsDragOver(true); }, onDragLeave: () => setIsDragOver(false), onDrop: (e) => {
                    e.preventDefault();
                    setIsDragOver(false);
                    addFiles(e.dataTransfer.files);
                }, children: _jsxs("div", { className: "formspec-file-drop-content", children: [_jsx("span", { className: "formspec-file-drop-icon", "aria-hidden": "true", children: '\u21F5' }), _jsx("span", { className: "formspec-file-drop-label", children: files.length === 0
                                ? (multiple ? 'Drag & drop files here' : 'Drag & drop a file here')
                                : `${files.length} file${files.length !== 1 ? 's' : ''} selected` }), _jsx("button", { type: "button", className: browseBtnClass, onClick: () => fileInputRef.current?.click(), disabled: isReadonly, children: "Browse" })] }) }), hiddenInput, fileList, errorEl] }));
}

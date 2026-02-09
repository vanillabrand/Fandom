import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import React from 'react';
import { createRoot } from 'react-dom/client';
import PDFReport from '../components/PDFReport.js';

// Types
export interface ExportData {
    nodes: any[];
    links: any[];
    analytics?: any;
    summary?: string;
    comparisonMetadata?: any;
    profileFullName?: string;
}

// ==========================================
// 1. CSV EXPORT LOGIC
// ==========================================

export const exportNodesToCSV = (nodes: any[], filename: string) => {
    if (!nodes || nodes.length === 0) return;

    const headers = ['Id', 'Label', 'Group', 'Value', 'Cluster', 'FollowerCount', 'Biography', 'URL', 'VisualArchetype'];
    let csvContent = headers.map(h => `"${h}"`).join(',') + '\n';

    nodes.forEach(node => {
        const row = [
            node.id,
            node.label || '',
            node.group || '',
            node.val || node.size || '',
            (node.group === 'cluster' ? node.label : ''), // Cluster Name
            node.data?.followerCount || node.data?.followersCount || '',
            (node.data?.biography || node.data?.bio || '').replace(/"/g, '""').replace(/\n/g, ' '),
            node.data?.externalUrl || node.data?.url || '',
            node.visualArchetype || '' // From Visual Intelligence
        ];
        csvContent += row.map(v => `"${v}"`).join(',') + '\n';
    });

    triggerDownload(csvContent, `${filename}_nodes.csv`, 'text/csv;charset=utf-8;');
};

export const exportEdgesToCSV = (links: any[], filename: string) => {
    if (!links || links.length === 0) return;

    const headers = ['Source', 'Target', 'Value', 'Type'];
    let csvContent = headers.map(h => `"${h}"`).join(',') + '\n';

    links.forEach(link => {
        const sourceId = typeof link.source === 'object' ? link.source.id : link.source;
        const targetId = typeof link.target === 'object' ? link.target.id : link.target;

        const row = [
            sourceId,
            targetId,
            link.value || 1,
            'undirected'
        ];
        csvContent += row.map(v => `"${v}"`).join(',') + '\n';
    });

    triggerDownload(csvContent, `${filename}_edges.csv`, 'text/csv;charset=utf-8;');
};

// ==========================================
// 2. JSON EXPORT LOGIC
// ==========================================

export const exportToJSON = (data: ExportData, filename: string) => {
    const jsonContent = JSON.stringify(data, null, 2);
    triggerDownload(jsonContent, `${filename}_full.json`, 'application/json');
};

// ==========================================
// 3. ADVANCED PDF REPORT (HTML -> PDF)
// ==========================================

export const generatePDFReport = async (
    data: ExportData,
    reportTitle: string,
    backgroundImage?: string
) => {
    try {
        console.log("Generating HTML-to-PDF Report...");

        // 1. Create a hidden container for rendering
        const container = document.createElement('div');
        container.style.position = 'absolute';
        container.style.top = '-9999px';
        container.style.left = '-9999px';
        // Force width to A4 size to ensure standard layout
        container.style.width = '210mm';
        container.style.zIndex = '-1';
        document.body.appendChild(container);

        // 2. Render the PDFReport component into the container
        const root = createRoot(container);

        // Wrap in a Promise to handle rendering wait
        await new Promise<void>((resolve, reject) => {
            // We use a small timeout to ensure React usually finishes the initial effect/layout
            // For complex data, might need 'onLoad' callbacks, but usually enough for static data
            // Since we know we are just rendering static data props, a small setImmediate/timeout is often okay.
            // A better approach is to pass a callback to the component, but standard Render is sync-ish for initial paint.

            try {
                root.render(
                    <PDFReport
                        data={data}
                        backgroundImage={backgroundImage}
                    />
                );
                // Give it a moment to resolve fonts, images, etc.
                setTimeout(() => resolve(), 1500);
            } catch (e) {
                reject(e);
            }
        });


        // 3. Capture with html2canvas
        // @ts-ignore
        const canvas = await (html2canvas.default || html2canvas)(container, {
            scale: 2, // Higher scale for better quality
            useCORS: true, // Allow loading remote images (proxied or CORS enabled)
            logging: false,
            backgroundColor: '#022c22' // Ensure background color if transparency fails
        });

        // 4. Generate PDF
        const imgData = canvas.toDataURL('image/png');
        const pdf = new jsPDF('p', 'mm', 'a4');
        const pdfWidth = pdf.internal.pageSize.getWidth();
        const pdfHeight = pdf.internal.pageSize.getHeight();

        pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight);
        pdf.save(`${reportTitle.replace(/\s+/g, '_')}_FandomReport.pdf`);

        // 5. Cleanup
        document.body.removeChild(container);
        root.unmount(); // React 18+ unmount

        console.log("PDF Generation Complete");

    } catch (err) {
        console.error("PDF Generation Failed", err);
        throw err;
    }
};

// Helper
const triggerDownload = (content: string, filename: string, mimeType: string) => {
    const blob = new Blob([content], { type: mimeType });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);

    link.setAttribute('href', url);
    link.setAttribute('download', filename);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
};

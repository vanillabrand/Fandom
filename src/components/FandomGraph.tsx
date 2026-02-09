import React, { useEffect, useRef } from 'react';
import * as d3 from 'd3';
import { Node, Link } from '../../types.js';

interface FandomGraphProps {
  nodes?: Node[];
  links?: Link[];
  overrideData?: any; // FandomData
  highlightedLabel?: string | null;
  profileImage?: string;
  profileFullName?: string;
  onNodeClick?: (nodeId: string) => void;
}

const FandomGraph: React.FC<FandomGraphProps> = ({ nodes = [], links = [], overrideData, highlightedLabel, profileImage, profileFullName, onNodeClick }) => {
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const simulationRef = useRef<d3.Simulation<d3.SimulationNodeDatum, undefined> | null>(null);

  const activeNodes = overrideData ? overrideData.nodes : nodes;
  const activeLinks = overrideData ? overrideData.links : links;

  // Initialize Simulation & Zoom
  useEffect(() => {
    if (!svgRef.current || !containerRef.current || activeNodes.length === 0) return;

    // Copy for simulation to avoid mutation issues
    const simNodes = JSON.parse(JSON.stringify(activeNodes));
    const simLinks = JSON.parse(JSON.stringify(activeLinks));

    const width = containerRef.current.clientWidth;
    const height = containerRef.current.clientHeight;
    console.log("FandomGraph mount:", { width, height, nodesCount: simNodes.length, linksCount: simLinks.length });

    const svg = d3.select(svgRef.current)
      .attr("viewBox", [0, 0, width, height]);

    svg.selectAll("*").remove();

    // Create a container group for zooming
    const g = svg.append("g");

    // Zoom setup
    const zoom = d3.zoom()
      .scaleExtent([0.1, 4])
      .on("zoom", (event) => {
        g.attr("transform", event.transform);
      });

    // Apply zoom to svg
    svg.call(zoom as any);

    // Simulation setup
    const simulation = d3.forceSimulation(nodes as d3.SimulationNodeDatum[])
      .force("link", d3.forceLink(links).id((d: any) => d.id).distance(120))
      .force("charge", d3.forceManyBody().strength(-400))
      .force("center", d3.forceCenter(width / 2, height / 2))
      .force("collide", d3.forceCollide().radius((d: any) => d.val * 2.5).iterations(2));

    simulationRef.current = simulation;

    // Link styling
    const link = g.append("g")
      .attr("class", "links")
      .attr("stroke", "#6d28d9") // Violet/Purple link color
      .attr("stroke-opacity", 0.3)
      .selectAll("line")
      .data(links)
      .join("line")
      .attr("stroke-width", (d) => Math.sqrt(d.value));

    // Node styling groups
    const node = g.append("g")
      .attr("class", "nodes")
      .selectAll("g")
      .data(nodes)
      .join("g")
      .call(drag(simulation) as any);

    // Node Circles - Fandom Palette
    node.append("circle")
      .attr("r", (d) => d.val)
      .attr("fill", (d) => {
        switch (d.group) {
          case 'main': return '#ffffff'; // White center
          case 'cluster': return '#10b981'; // Mint Green
          case 'creator': return '#f472b6'; // Pink
          case 'brand': return '#3b82f6'; // Bright Blue
          case 'nonRelatedInterest': return '#f59e0b'; // Amber/Orange
          case 'overindexed': return '#f97316'; // Bright Orange
          case 'topic': return '#8b5cf6'; // Violet
          case 'subtopic': return '#c4b5fd'; // Light Violet
          default: return '#9ca3af'; // Gray fallback for unknowns
        }
      })
      .attr("stroke", "#051810") // Dark purple border
      .attr("stroke-width", 2)
      .style("cursor", "pointer")
      .style("transition", "opacity 0.2s ease")
      .on("click", (event, d) => {
        if (onNodeClick) {
          event.stopPropagation();
          onNodeClick((d as any).id);
        }
      });

    // Labels - skip label for main node
    node.append("text")
      .text((d) => d.group === 'main' ? '' : d.label)
      .attr("x", (d) => d.val + 6)
      .attr("y", 4)
      .style("font-size", "11px")
      .style("font-family", "Inter, sans-serif")
      .style("font-weight", "600")
      .style("fill", "#e9d5ff") // Light purple text
      .style("pointer-events", "none")
      .style("text-shadow", "0px 2px 4px #000000")
      .style("transition", "opacity 0.2s ease");


    // Helper function to wrap text
    function wrapText(text: any, width: number) {
      text.each(function (this: any) {
        const textElement = d3.select(this);
        const words = textElement.text().split(/\s+/).reverse();
        let word;
        let line: string[] = [];
        let lineNumber = 0;
        const lineHeight = 1.1;
        const y = textElement.attr("y") || 0;
        const dy = parseFloat(textElement.attr("dy") || 0);
        let tspan = textElement.text(null).append("tspan").attr("x", 0).attr("y", y).attr("dy", dy + "em");

        while ((word = words.pop())) {
          line.push(word);
          tspan.text(line.join(" "));
          if (tspan.node()!.getComputedTextLength() > width) {
            line.pop();
            tspan.text(line.join(" "));
            line = [word];
            tspan = textElement.append("tspan").attr("x", 0).attr("y", y).attr("dy", ++lineNumber * lineHeight + dy + "em").text(word);
          }
        }
      });
    }

    // Add fullName text inside main node
    if (profileFullName) {
      node.filter((d: any) => d.group === 'main')
        .append("text")
        .text(profileFullName)
        .attr("text-anchor", "middle")
        .attr("dy", "0.35em")
        .style("font-size", "10px")
        .style("font-family", "Inter, sans-serif")
        .style("font-weight", "700")
        .style("fill", "#051810")
        .style("pointer-events", "none")
        .call(wrapText, 80); // Wrap text to fit within node
    }

    // Simulation tick
    simulation.on("tick", () => {
      link
        .attr("x1", (d: any) => d.source.x)
        .attr("y1", (d: any) => d.source.y)
        .attr("x2", (d: any) => d.target.x)
        .attr("y2", (d: any) => d.target.y);

      node
        .attr("transform", (d: any) => `translate(${d.x},${d.y})`);
    });

    function drag(simulation: d3.Simulation<d3.SimulationNodeDatum, undefined>) {
      function dragstarted(event: any) {
        if (!event.active) simulation.alphaTarget(0.3).restart();
        event.subject.fx = event.subject.x;
        event.subject.fy = event.subject.y;
      }

      function dragged(event: any) {
        event.subject.fx = event.x;
        event.subject.fy = event.y;
      }

      function dragended(event: any) {
        if (!event.active) simulation.alphaTarget(0);
        event.subject.fx = null;
        event.subject.fy = null;
      }

      return d3.drag()
        .on("start", dragstarted)
        .on("drag", dragged)
        .on("end", dragended);
    }

    return () => {
      simulation.stop();
    };
  }, [nodes, links]);

  // Handle Highlighting
  useEffect(() => {
    if (!svgRef.current) return;

    const svg = d3.select(svgRef.current);
    const nodesSel = svg.selectAll(".nodes g");
    const linksSel = svg.selectAll(".links line");

    if (!highlightedLabel) {
      // Reset
      nodesSel.style("opacity", 1);
      linksSel.style("opacity", 0.3);
      return;
    }

    // Identify connected nodes
    const connectedNodeIds = new Set<string>();

    // Find the node that matches the label
    const targetNode = nodes.find(n => n.label === highlightedLabel);

    if (targetNode) {
      connectedNodeIds.add(targetNode.id);
      links.forEach(l => {
        const sourceId = (l.source as any).id || l.source;
        const targetId = (l.target as any).id || l.target;

        if (sourceId === targetNode.id) connectedNodeIds.add(targetId);
        if (targetId === targetNode.id) connectedNodeIds.add(sourceId);
      });
    }

    // Apply styles
    nodesSel.style("opacity", (d: any) => {
      return connectedNodeIds.has(d.id) ? 1 : 0.1;
    });

    linksSel.style("opacity", (d: any) => {
      const sourceId = d.source.id;
      const targetId = d.target.id;
      if (connectedNodeIds.has(sourceId) && connectedNodeIds.has(targetId)) return 0.8;
      return 0.05;
    });

  }, [highlightedLabel, nodes, links]);

  return (
    <div ref={containerRef} className="w-full h-full relative overflow-hidden bg-[#051810] cursor-move">
      {/* Legend */}
      <div className="absolute top-6 left-6 z-10 flex gap-6 text-[10px] font-bold tracking-wider uppercase text-emerald-400 pointer-events-none">
        <div className="flex items-center gap-2"><span className="w-2 h-2 rounded-full bg-white shadow-[0_0_10px_white]"></span>Profile</div>
        <div className="flex items-center gap-2"><span className="w-2 h-2 rounded-full bg-emerald-500 shadow-[0_0_10px_#10b981]"></span>Cluster</div>
        <div className="flex items-center gap-2"><span className="w-2 h-2 rounded-full bg-pink-400 shadow-[0_0_10px_#f472b6]"></span>Creator</div>
        <div className="flex items-center gap-2"><span className="w-2 h-2 rounded-full bg-blue-500 shadow-[0_0_10px_#3b82f6]"></span>Brand</div>
        <div className="flex items-center gap-2"><span className="w-2 h-2 rounded-full bg-orange-500 shadow-[0_0_10px_#f97316]"></span>Over-indexed</div>
      </div>
      <svg ref={svgRef} className="w-full h-full"></svg>
    </div>
  );
};

export default FandomGraph;

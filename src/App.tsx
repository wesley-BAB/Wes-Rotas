import React, { useState, useEffect } from 'react';
import { 
  MapPin, 
  Navigation, 
  Fuel, 
  Calculator, 
  Coins, 
  Plus, 
  Trash2, 
  ChevronRight,
  Route as RouteIcon,
  Search,
  CheckCircle2,
  AlertCircle,
  Download
} from 'lucide-react';
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap } from 'react-leaflet';
import L from 'leaflet';
import { cn } from './lib/utils';
import { motion, AnimatePresence } from 'motion/react';
import { LocationInput } from './components/LocationInput';
import * as htmlToImage from 'html-to-image';

// For fix Leaflet marker icons
const DefaultIcon = L.icon({
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41]
});

const createLetterIcon = (letter: string, color: string) => {
  return L.divIcon({
    html: `<div class="w-8 h-8 flex items-center justify-center rounded-full border-2 border-white shadow-lg text-white font-bold text-sm" style="background-color: ${color}">${letter}</div>`,
    className: '',
    iconSize: [32, 32],
    iconAnchor: [16, 32],
  });
};

interface Location {
  address: string;
  lat: number | null;
  lon: number | null;
}

interface LegStats {
  distance: number;
  duration: number;
}

interface RouteStats {
  distance: number; // in meters
  duration: number; // in seconds
  geometry: any;
  legs: LegStats[];
}

// Center map view when route changes
function MapController({ bounds }: { bounds: L.LatLngBounds | null }) {
  const map = useMap();
  useEffect(() => {
    if (bounds) {
      map.fitBounds(bounds, { padding: [80, 80] });
    }
  }, [bounds, map]);
  return null;
}

export default function App() {
  const [origin, setOrigin] = useState<Location>({ address: '', lat: null, lon: null });
  const [destination, setDestination] = useState<Location>({ address: '', lat: null, lon: null });
  const [stops, setStops] = useState<Location[]>([]);
  const [fuelPrice, setFuelPrice] = useState<string>('5.50');
  const [autonomy, setAutonomy] = useState<string>('10');
  const [tollsInput, setTollsInput] = useState<string>('0');
  
  const [loading, setLoading] = useState(false);
  const [routeStats, setRouteStats] = useState<RouteStats | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const dashboardRef = React.useRef<HTMLDivElement>(null);
  const exportRef = React.useRef<HTMLDivElement>(null);

  const handleExport = async () => {
    if (!exportRef.current) return;
    
    setExporting(true);
    try {
      // Ensure the export div is temporarily visible to capture (though it's off-screen)
      const dataUrl = await htmlToImage.toPng(exportRef.current, {
        cacheBust: true,
        backgroundColor: '#ffffff',
        pixelRatio: 2, // Higher quality
      });
      
      const link = document.createElement('a');
      link.download = `wes-rotas-${new Date().toLocaleDateString('pt-BR').replace(/\//g, '-')}.png`;
      link.href = dataUrl;
      link.click();
    } catch (err) {
      console.error('Export error:', err);
      setError("Não foi possível gerar a imagem. Tente novamente.");
    } finally {
      setExporting(false);
    }
  };

  const geocode = async (address: string): Promise<{ lat: number; lon: number } | null> => {
    try {
      const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(address)}&limit=1`);
      const data = await res.json();
      if (data && data.length > 0) {
        return { lat: parseFloat(data[0].lat), lon: parseFloat(data[0].lon) };
      }
      return null;
    } catch (e) {
      console.error('Geocoding error:', e);
      return null;
    }
  };

  const handleCalculate = async () => {
    if (!origin.address || !destination.address) {
      setError("Por favor, informe a origem e o destino.");
      return;
    }

    setLoading(true);
    setError(null);
    setRouteStats(null);
    setExporting(false);

    try {
      // 1. Geocode only if lat/lon are missing
      let originPos = { lat: origin.lat, lon: origin.lon };
      if (originPos.lat === null || originPos.lon === null) {
        const result = await geocode(origin.address);
        if (result) originPos = result;
      }

      let destPos = { lat: destination.lat, lon: destination.lon };
      if (destPos.lat === null || destPos.lon === null) {
        const result = await geocode(destination.address);
        if (result) destPos = result;
      }
      
      if (!originPos.lat || !destPos.lat) {
        setError("Não foi possível localizar os endereços. Tente ser mais específico.");
        setLoading(false);
        return;
      }

      setOrigin(prev => ({ ...prev, ...originPos }));
      setDestination(prev => ({ ...prev, ...destPos }));

      const stopPositions: Location[] = [];
      for (const stop of stops) {
        if (stop.address) {
          let pos = { lat: stop.lat, lon: stop.lon };
          if (pos.lat === null || pos.lon === null) {
            const result = await geocode(stop.address);
            if (result) pos = result;
          }

          if (pos.lat && pos.lon) {
            stopPositions.push({ ...stop, ...pos });
          }
        }
      }
      setStops(stopPositions);

      // 2. Build coordinates for routing
      const allCoords = [
        [originPos.lon, originPos.lat],
        ...stopPositions.map(s => [s.lon as number, s.lat as number]),
        [destPos.lon, destPos.lat]
      ].map(c => c.join(',')).join(';');

      // 3. Fetch Route from OSRM
      const routeRes = await fetch(`https://router.project-osrm.org/route/v1/driving/${allCoords}?overview=full&geometries=geojson&steps=false`);
      const routeData = await routeRes.json();

      if (routeData.code === 'Ok') {
        const route = routeData.routes[0];
        setRouteStats({
          distance: route.distance,
          duration: route.duration,
          geometry: route.geometry,
          legs: route.legs.map((l: any) => ({
            distance: l.distance,
            duration: l.duration
          }))
        });
      } else {
        setError("Não foi possível calcular a rota entre os pontos informados.");
      }
    } catch (e) {
      setError("Ocorreu um erro ao processar a rota. Verifique sua conexão.");
    } finally {
      setLoading(false);
    }
  };

  const addStop = () => {
    setStops([...stops, { address: '', lat: null, lon: null }]);
  };

  const updateStop = (index: number, address: string) => {
    const newStops = [...stops];
    newStops[index].address = address;
    setStops(newStops);
  };

  const removeStop = (index: number) => {
    setStops(stops.filter((_, i) => i !== index));
  };

  const distanceKm = routeStats ? routeStats.distance / 1000 : 0;
  const fuelCost = (distanceKm / parseFloat(autonomy || '1')) * parseFloat(fuelPrice || '0');
  const totalCost = fuelCost + parseFloat(tollsInput || '0');

  const bounds = routeStats ? L.geoJSON(routeStats.geometry).getBounds() : null;

  return (
    <div className="flex flex-col md:flex-row h-screen bg-slate-50 font-sans overflow-hidden">
      {/* Hidden Export Template */}
      <div className="absolute left-[-9999px] top-0">
        <div ref={exportRef} className="w-[600px] bg-white p-8 space-y-6">
          <div className="flex items-center justify-between border-b border-slate-100 pb-4">
            <div className="flex items-center gap-2">
              <div className="p-2 bg-indigo-600 rounded-lg">
                <Navigation className="w-6 h-6 text-white" />
              </div>
              <h1 className="text-2xl font-bold font-display text-slate-900 tracking-tight">Wes Rotas</h1>
            </div>
            <div className="text-right">
              <p className="text-xs text-slate-400 font-bold uppercase">Data</p>
              <p className="text-sm font-medium text-slate-600">{new Date().toLocaleDateString('pt-BR')}</p>
            </div>
          </div>

          <div className="space-y-4">
            <div className="flex gap-4">
              <div className="w-1 bg-indigo-500 rounded-full" />
              <div className="space-y-4 flex-1">
                <div>
                  <p className="text-xs font-bold text-indigo-500 uppercase">A - Origem</p>
                  <p className="text-sm text-slate-800 font-medium">{origin.address}</p>
                </div>
                {stops.length > 0 && stops.map((s, i) => (
                  <div key={i} className="flex justify-between items-start">
                    <div>
                      <p className="text-xs font-bold text-amber-500 uppercase">{String.fromCharCode(66 + i)} - Parada {i + 1}</p>
                      <p className="text-sm text-slate-800 font-medium">{s.address}</p>
                    </div>
                    {routeStats && routeStats.legs[i] && (
                      <div className="text-right">
                        <p className="text-[10px] font-bold text-slate-400">TRECHO {i + 1}</p>
                        <p className="text-xs font-bold text-slate-600">
                          {(routeStats.legs[i].distance / 1000).toFixed(1)}km | R$ {((routeStats.legs[i].distance / 1000 / parseFloat(autonomy || '1')) * parseFloat(fuelPrice || '0')).toFixed(2)}
                        </p>
                      </div>
                    )}
                  </div>
                ))}
                <div className="flex justify-between items-start">
                  <div>
                    <p className="text-xs font-bold text-emerald-500 uppercase">{String.fromCharCode(66 + stops.length)} - Destino</p>
                    <p className="text-sm text-slate-800 font-medium">{destination.address}</p>
                  </div>
                  {routeStats && routeStats.legs[stops.length] && (
                    <div className="text-right">
                      <p className="text-[10px] font-bold text-slate-400">TRECHO FINAL</p>
                      <p className="text-xs font-bold text-slate-600">
                        {(routeStats.legs[stops.length].distance / 1000).toFixed(1)}km | R$ {((routeStats.legs[stops.length].distance / 1000 / parseFloat(autonomy || '1')) * parseFloat(fuelPrice || '0')).toFixed(2)}
                      </p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4 bg-slate-50 p-6 rounded-2xl">
            <div className="space-y-1">
              <p className="text-xs text-slate-400 font-bold uppercase">Distância</p>
              <p className="text-2xl font-bold text-slate-800">{(distanceKm).toFixed(1)} km</p>
            </div>
            <div className="space-y-1">
              <p className="text-xs text-slate-400 font-bold uppercase">Combustível</p>
              <p className="text-2xl font-bold text-slate-800">R$ {fuelCost.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
            </div>
            <div className="space-y-1">
              <p className="text-xs text-slate-400 font-bold uppercase">Pedágios</p>
              <p className="text-2xl font-bold text-slate-800">R$ {parseFloat(tollsInput || '0').toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
            </div>
            <div className="bg-indigo-600 p-4 rounded-xl space-y-1 col-span-2">
              <p className="text-indigo-100 text-xs font-bold uppercase">Valor Total Estimado</p>
              <p className="text-3xl font-bold text-white">R$ {totalCost.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
            </div>
          </div>
          
          <div className="pt-4 text-center">
            <p className="text-[10px] text-slate-300 font-medium italic">Calculado via Wes Rotas - Planejamento Inteligente de Viagens</p>
          </div>
        </div>
      </div>

      {/* Main UI */}
      <div className="w-full md:w-[400px] xl:w-[480px] bg-white shadow-xl flex flex-col z-20 h-full overflow-hidden">
        <header className="p-6 border-b border-slate-100 bg-white flex justify-between items-start">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <div className="p-2 bg-indigo-600 rounded-lg">
                <Navigation className="w-6 h-6 text-white" />
              </div>
              <h1 className="text-2xl font-bold font-display text-slate-900 tracking-tight">Wes Rotas</h1>
            </div>
            <p className="text-sm text-slate-500">Planeje sua viagem e controle os custos.</p>
          </div>
          {(origin.address || destination.address || stops.length > 0) && (
            <button 
              onClick={() => {
                setOrigin({ address: '', lat: null, lon: null });
                setDestination({ address: '', lat: null, lon: null });
                setStops([]);
                setRouteStats(null);
                setError(null);
              }}
              className="text-xs font-bold text-slate-400 hover:text-red-500 transition-colors uppercase tracking-widest pt-2"
            >
              Limpar
            </button>
          )}
        </header>

        <div className="flex-1 overflow-y-auto p-6 space-y-8">
          {/* Section: Inputs de Rota */}
          <section className="space-y-4">
            <h2 className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-2">
              <RouteIcon className="w-4 h-4" /> Itinerário
            </h2>
            
            <div className="space-y-3 relative">
              {/* Decoration Line */}
              <div className="absolute left-[19px] top-6 bottom-6 w-0.5 bg-slate-100 z-0" />
              
              <div className="space-y-1 relative z-10">
                <label className="text-xs font-semibold text-slate-500 ml-10">Origem</label>
                <LocationInput
                  value={origin.address}
                  onChange={(address, lat, lon) => setOrigin({ address, lat: lat ?? null, lon: lon ?? null })}
                  placeholder="Cidade ou endereço de partida"
                  icon={
                    <div className="w-10 h-10 flex items-center justify-center rounded-full bg-indigo-50 text-indigo-600 shrink-0 border-2 border-white shadow-sm">
                      <MapPin className="w-5 h-5" />
                    </div>
                  }
                />
              </div>

              <AnimatePresence>
                {stops.map((stop, idx) => (
                  <motion.div 
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    key={idx} 
                    className="space-y-1 relative z-10"
                  >
                    <label className="text-xs font-semibold text-slate-500 ml-10 flex justify-between items-center pr-2">
                      Parada {idx + 1}
                      <button onClick={() => removeStop(idx)} className="text-red-400 hover:text-red-600 transition-colors">
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </label>
                    <LocationInput
                      value={stop.address}
                      onChange={(address, lat, lon) => {
                        const newStops = [...stops];
                        newStops[idx] = { address, lat: lat ?? null, lon: lon ?? null };
                        setStops(newStops);
                      }}
                      placeholder="Endereço da parada"
                      icon={
                        <div className="w-10 h-10 flex items-center justify-center rounded-full bg-amber-50 text-amber-600 shrink-0 border-2 border-white shadow-sm">
                          <MapPin className="w-5 h-5" />
                        </div>
                      }
                    />
                  </motion.div>
                ))}
              </AnimatePresence>

              <button 
                onClick={addStop}
                className="ml-13 flex items-center gap-2 text-sm font-semibold text-indigo-600 hover:text-indigo-700 transition-colors py-2"
              >
                <Plus className="w-4 h-4" /> Adicionar Parada
              </button>

              <div className="space-y-1 relative z-10">
                <label className="text-xs font-semibold text-slate-500 ml-10">Destino</label>
                <LocationInput
                  value={destination.address}
                  onChange={(address, lat, lon) => setDestination({ address, lat: lat ?? null, lon: lon ?? null })}
                  placeholder="Cidade ou endereço de destino"
                  icon={
                    <div className="w-10 h-10 flex items-center justify-center rounded-full bg-emerald-50 text-emerald-600 shrink-0 border-2 border-white shadow-sm">
                      <MapPin className="w-5 h-5" />
                    </div>
                  }
                />
              </div>
            </div>
          </section>

          {/* Section: Configurações de Veículo */}
          <section className="space-y-4">
            <h2 className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-2">
              <Fuel className="w-4 h-4" /> Consumo & Custos
            </h2>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-500 block">Preço Combustível (R$/L)</label>
                <div className="relative">
                  <Coins className="w-4 h-4 absolute left-3 top-3.5 text-slate-400" />
                  <input 
                    type="number" 
                    step="0.01"
                    className="w-full pl-9 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500"
                    value={fuelPrice}
                    onChange={(e) => setFuelPrice(e.target.value)}
                  />
                </div>
              </div>
              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-500 block">Consumo (km/L)</label>
                <div className="relative">
                  <Fuel className="w-4 h-4 absolute left-3 top-3.5 text-slate-400" />
                  <input 
                    type="number" 
                    className="w-full pl-9 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500"
                    value={autonomy}
                    onChange={(e) => setAutonomy(e.target.value)}
                  />
                </div>
              </div>
            </div>
            
            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-500 block">Pedágios Estimados (R$)</label>
              <div className="relative">
                <Coins className="w-4 h-4 absolute left-3 top-3.5 text-slate-400" />
                <input 
                  type="number" 
                  step="0.01"
                  placeholder="Se houver pedágio, inclua o valor total"
                  className="w-full pl-9 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500"
                  value={tollsInput}
                  onChange={(e) => setTollsInput(e.target.value)}
                />
              </div>
            </div>
          </section>

          {error && (
            <motion.div 
              initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}
              className="p-4 bg-red-50 rounded-xl border border-red-100 flex items-start gap-3"
            >
              <AlertCircle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
              <p className="text-sm text-red-700 font-medium">{error}</p>
            </motion.div>
          )}

          <AnimatePresence>
            {routeStats && (
              <motion.div 
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                className="pt-4 border-t border-slate-100"
              >
                <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-4">Detalhamento Financeiro</h3>
                <div className="space-y-4">
                  {routeStats.legs.map((leg, idx) => {
                    const legKm = leg.distance / 1000;
                    const legCost = (legKm / parseFloat(autonomy || '1')) * parseFloat(fuelPrice || '0');
                    return (
                      <div key={idx} className="flex justify-between items-center text-sm">
                        <div className="flex items-center gap-2">
                          <div className="w-6 h-6 rounded-full bg-slate-100 text-[10px] flex items-center justify-center font-bold text-slate-500">
                            {idx + 1}
                          </div>
                          <span className="text-slate-600 font-medium">Trecho {idx + 1}</span>
                        </div>
                        <div className="text-right">
                          <p className="font-bold text-slate-800">R$ {legCost.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                          <p className="text-[10px] text-slate-400 uppercase font-bold">{legKm.toFixed(1)} km</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          <button 
            onClick={handleCalculate}
            disabled={loading}
            className={cn(
              "w-full py-4 rounded-2xl font-bold transition-all flex items-center justify-center gap-3 text-white shadow-lg shadow-indigo-200",
              loading ? "bg-indigo-400 cursor-not-allowed" : "bg-indigo-600 hover:bg-indigo-700 active:scale-95"
            )}
          >
            {loading ? (
              <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : (
              <>
                <Calculator className="w-5 h-5" />
                Calcular Rota e Custos
              </>
            )}
          </button>
        </div>

        {/* Footer Stats Summary */}
        <AnimatePresence>
          {routeStats && (
            <motion.div 
              initial={{ y: 100 }}
              animate={{ y: 0 }}
              exit={{ y: 100 }}
              className="bg-indigo-600 p-6 text-white"
            >
              <div className="space-y-4">
                <div className="flex justify-between items-end border-b border-white/10 pb-4">
                  <div>
                    <p className="text-white/60 text-xs font-bold uppercase tracking-wider">Distância Total</p>
                    <p className="text-3xl font-display font-bold">{(routeStats.distance / 1000).toFixed(1)} <span className="text-xl">km</span></p>
                  </div>
                  <div className="text-right">
                    <p className="text-white/60 text-xs font-bold uppercase tracking-wider">Tempo Estimado</p>
                    <p className="text-xl font-semibold">{(routeStats.duration / 3600).toFixed(1)}h</p>
                  </div>
                </div>
                
                <div className="flex justify-between items-center text-xl font-display">
                  <div>
                    <p className="text-white/60 text-xs font-bold uppercase tracking-wider">Custo Aproximado</p>
                    <p className="font-bold text-3xl">R$ {totalCost.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                  </div>
                  <button 
                    onClick={(e) => {
                      e.stopPropagation();
                      handleExport();
                    }}
                    disabled={exporting}
                    className="p-3 bg-white/20 hover:bg-white/30 rounded-full transition-colors disabled:opacity-50"
                    title="Exportar Resultado como PNG"
                  >
                    {exporting ? (
                      <div className="w-8 h-8 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    ) : (
                      <Download className="w-8 h-8 text-white" />
                    )}
                  </button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Map Area */}
      <div className="flex-1 relative">
        <MapContainer 
          center={[-15.7801, -47.9292]} // Brasilia default
          zoom={4} 
          scrollWheelZoom={true}
          style={{ height: "100%", width: "100%" }}
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            crossOrigin={true}
          />
          
          {origin.lat && origin.lon && (
            <Marker position={[origin.lat, origin.lon]} icon={createLetterIcon('A', '#4f46e5')}>
              <Popup>Origem: {origin.address}</Popup>
            </Marker>
          )}

          {stops.map((stop, i) => (
            stop.lat && stop.lon && (
              <Marker key={i} position={[stop.lat, stop.lon]} icon={createLetterIcon(String.fromCharCode(66 + i), '#d97706')}>
                <Popup>Parada {i + 1}: {stop.address}</Popup>
              </Marker>
            )
          ))}

          {destination.lat && destination.lon && (
            <Marker position={[destination.lat, destination.lon]} icon={createLetterIcon(String.fromCharCode(66 + stops.length), '#10b981')}>
              <Popup>Destino: {destination.address}</Popup>
            </Marker>
          )}

          {routeStats && (
            <Polyline 
              positions={routeStats.geometry.coordinates.map((c: any) => [c[1], c[0]])}
              pathOptions={{ color: '#4f46e5', weight: 6, opacity: 0.7, lineJoin: 'round' }}
            />
          )}

          <MapController bounds={bounds} />
        </MapContainer>

        {/* Float Overlays */}
        {!routeStats && (
          <div className="absolute top-10 left-10 right-10 z-10 pointer-events-none">
            <div className="bg-white/90 backdrop-blur-md p-4 rounded-2xl shadow-xl w-fit mx-auto border border-white flex items-center gap-3">
              <div className="p-2 bg-indigo-100 rounded-full">
                <Search className="w-5 h-5 text-indigo-600" />
              </div>
              <p className="text-slate-700 font-medium pr-4">Digite os endereços para começar o planejamento.</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

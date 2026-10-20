import { beforeEach, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import CommunityDashboard from '../components/communities/CommunityDashboard.jsx';
import { useChannels } from '../hooks/useChannels.js';
import { useCommunityCollection } from '../hooks/useCommunityCollection.js';
vi.mock('../hooks/useChannels.js', () => ({ useChannels: vi.fn() }));
vi.mock('../hooks/useCommunityCollection.js', () => ({ useCommunityCollection: vi.fn() }));
vi.mock('../hooks/useSocket.js', () => ({ useSocket: () => null }));
let channels, members;
const community={id:4,nombre:'Club'};
const channel=(id)=>({id,nombre:`canal-${id}`,tipo:'TEXTO',privado:id===2});
const person=(id)=>({usuario:{id,nombreVisible:`Persona ${id}`,nombreUsuario:`persona${id}`},rol:'INTEGRANTE'});
const view=()=>render(<MemoryRouter><CommunityDashboard comunidad={community}/></MemoryRouter>);
beforeEach(()=>{
 channels={items:[channel(1),channel(2)],loading:false,error:null,reload:vi.fn()};
 members={items:[person(1),person(2)],loading:false,error:null,reload:vi.fn()};
 useChannels.mockImplementation(()=>channels);useCommunityCollection.mockImplementation(()=>members);
});
it('abre los canales reales por ID y los integrantes de esa comunidad',()=>{
 view();expect(screen.getByRole('link',{name:/canal-2/})).toHaveAttribute('href','/comunidades/4/canales/2');
 expect(screen.getByRole('link',{name:'Ver canales'})).toHaveAttribute('href','/comunidades/4/canales');
 expect(screen.getByRole('link',{name:'Ver integrantes'})).toHaveAttribute('href','/comunidades/4/integrantes');
 expect(screen.getByText('Persona 2')).toBeInTheDocument();expect(screen.getByText('Texto · Privado')).toBeInTheDocument();
});
it('distingue cargas, vacíos y errores con reintento independiente',()=>{
 channels={...channels,items:[],error:new Error('Sin red')};members={...members,items:[],loading:true};const mounted=view();
 fireEvent.click(screen.getByRole('button',{name:'Reintentar canales'}));expect(channels.reload).toHaveBeenCalledOnce();expect(screen.getByRole('status')).toHaveTextContent('Cargando integrantes');
 channels={...channels,error:null};members={...members,loading:false};mounted.rerender(<MemoryRouter><CommunityDashboard comunidad={community}/></MemoryRouter>);
 expect(screen.getByText('No hay canales disponibles para tu cuenta.')).toBeInTheDocument();expect(screen.getByText('No hay integrantes para mostrar.')).toBeInTheDocument();
});
it('acota la vista previa y mantiene acceso al conjunto completo',()=>{
 channels.items=Array.from({length:10},(_,i)=>channel(i+1));members.items=Array.from({length:9},(_,i)=>person(i+1));view();
 expect(screen.queryByRole('link',{name:/canal-9/})).not.toBeInTheDocument();expect(screen.getByRole('link',{name:'Ver los 10 canales →'})).toHaveAttribute('href','/comunidades/4/canales');
 expect(screen.queryByText('Persona 7')).not.toBeInTheDocument();expect(screen.getByRole('link',{name:'Ver los 9 integrantes →'})).toHaveAttribute('href','/comunidades/4/integrantes');
});
it('retira un canal revocado y actualiza la identidad desde las colecciones vigentes',()=>{
 const mounted=view();channels={...channels,items:[channel(1)]};members={...members,items:[{...person(1),usuario:{...person(1).usuario,nombreVisible:'Nueva identidad'}}]};
 mounted.rerender(<MemoryRouter><CommunityDashboard comunidad={community}/></MemoryRouter>);
 expect(screen.queryByRole('link',{name:/canal-2/})).not.toBeInTheDocument();expect(screen.getByText('Nueva identidad')).toBeInTheDocument();expect(screen.queryByText('Persona 1')).not.toBeInTheDocument();
});
it('voz y video llevan al detalle existente, sin ofrecer llamadas no implementadas',()=>{
 channels.items=[{...channel(8),tipo:'VOZ'},{...channel(9),tipo:'VIDEO'}];view();expect(screen.getByText('Voz · Público')).toBeInTheDocument();expect(screen.queryByRole('button',{name:/llamar|conectar/i})).not.toBeInTheDocument();
});

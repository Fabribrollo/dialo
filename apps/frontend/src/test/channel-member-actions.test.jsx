import {fireEvent,render,screen,waitFor} from '@testing-library/react';
import {beforeEach,expect,test,vi} from 'vitest';
import ChannelMemberActions from '../components/channels/ChannelMemberActions.jsx';
const api=vi.hoisted(()=>({get:vi.fn(),post:vi.fn()}));
vi.mock('../services/api.js',()=>({api}));
const canal={id:3,idComunidad:8,tipo:'VOZ',misPermisos:['VER','SILENCIAR']};
beforeEach(()=>{vi.clearAllMocks();api.get.mockResolvedValue({items:[{usuario:{id:2,nombreVisible:'Ana'},rol:'INTEGRANTE',silenciado:true}]});api.post.mockResolvedValue({});});
test('levanta silencio persistente aunque el integrante no esté en llamada',async()=>{
 render(<ChannelMemberActions canal={canal}/>);fireEvent.click(screen.getByRole('button',{name:'Gestionar integrantes del canal'}));
 await screen.findByRole('option',{name:'Ana'});expect(api.get).toHaveBeenCalledWith('/channels/3/members/management');fireEvent.change(screen.getByLabelText('Integrante del canal'),{target:{value:'2'}});
 fireEvent.click(screen.getByRole('button',{name:'Levantar silencio'}));fireEvent.click(screen.getByRole('button',{name:'Confirmar',exact:true}));
 await waitFor(()=>expect(api.post).toHaveBeenCalledWith('/channels/3/members/2/silence',{silenciado:false}));
 expect(await screen.findByRole('button',{name:'Silenciar',exact:true})).toBeInTheDocument();
});
test('cancelar expulsión del canal no modifica membresía',async()=>{
 render(<ChannelMemberActions canal={{...canal,tipo:'TEXTO',misPermisos:['VER','EXPULSAR']}}/>);fireEvent.click(screen.getByRole('button',{name:'Gestionar integrantes del canal'}));
 await screen.findByRole('option',{name:'Ana'});fireEvent.change(screen.getByLabelText('Integrante del canal'),{target:{value:'2'}});fireEvent.click(screen.getByRole('button',{name:'Expulsar del canal',exact:true}));
 expect(screen.getByRole('dialog')).toHaveTextContent('Solo cambia el acceso a este canal');fireEvent.click(screen.getByRole('button',{name:'Cancelar'}));expect(api.post).not.toHaveBeenCalled();
});
test('sin capacidades no muestra acciones ni consulta integrantes',()=>{
 const {container}=render(<ChannelMemberActions canal={{...canal,misPermisos:['VER']}}/>);expect(container).toBeEmptyDOMElement();expect(api.get).not.toHaveBeenCalled();
});

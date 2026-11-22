export const openProfile=id=>window.dispatchEvent(new CustomEvent('dialo:profile',{detail:{id}}));
